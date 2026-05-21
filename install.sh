#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# AI Workspace Manager installer for Linux, WSL and macOS.
# Linux/WSL uses the headless web mode: Node backend + Vite frontend.
# macOS keeps the desktop Electron flow.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/wilkinbarban/AI-Workspace-Manager/main/install.sh | bash

readonly REPO_URL="https://github.com/wilkinbarban/AI-Workspace-Manager"
readonly ZIP_URL="$REPO_URL/archive/refs/heads/main.zip"
readonly TARGET_FOLDER="${TARGET_FOLDER:-$HOME/AI-Workspace-Manager}"
readonly START_APP="${START_APP:-true}"
readonly BACKEND_PORT="${BACKEND_PORT:-3000}"
readonly FRONTEND_PORT="${FRONTEND_PORT:-5173}"

LOG_FILE=""
TMP_ZIP=""
TMP_DIR=""
OS_TYPE=""
DISTRO_ID=""

COLOR_RESET="\033[0m"
COLOR_INFO="\033[1;36m"
COLOR_SUCCESS="\033[1;32m"
COLOR_WARN="\033[1;33m"
COLOR_ERROR="\033[1;31m"
COLOR_CYAN="\033[1;36m"

timestamp() {
  date +"%Y-%m-%d %H:%M:%S"
}

log() {
  echo "[$(timestamp)] $*" >> "$LOG_FILE"
}

info() {
  log "INFO: $*"
  printf "%b%s%b\n" "$COLOR_INFO" "==> $*" "$COLOR_RESET"
}

success() {
  log "SUCCESS: $*"
  printf "%b%s%b\n" "$COLOR_SUCCESS" "OK: $*" "$COLOR_RESET"
}

warn() {
  log "WARNING: $*"
  printf "%b%s%b\n" "$COLOR_WARN" "WARN: $*" "$COLOR_RESET"
}

error() {
  log "ERROR: $*"
  printf "%b%s%b\n" "$COLOR_ERROR" "ERROR: $*" "$COLOR_RESET"
}

die() {
  error "$*"
  printf "%b%s%b\n" "$COLOR_WARN" "Install log: $LOG_FILE" "$COLOR_RESET"
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

is_linux() {
  [[ "$OS_TYPE" == "linux" ]]
}

is_macos() {
  [[ "$OS_TYPE" == "macos" ]]
}

is_wsl() {
  [[ -f /proc/version ]] && grep -qiE "(microsoft|wsl)" /proc/version
}

create_temp_paths() {
  local tmp_base="${TMPDIR:-/tmp}/ai-workspace-manager.$(date +%s%N)"
  TMP_ZIP="$tmp_base.zip"
  TMP_DIR="$tmp_base"
  LOG_FILE="$tmp_base.install.log"
  touch "$LOG_FILE"
}

cleanup() {
  if [[ -n "$TMP_ZIP" && -f "$TMP_ZIP" ]]; then
    rm -f "$TMP_ZIP" || true
  fi

  if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then
    rm -rf "$TMP_DIR" || true
  fi
}
trap cleanup EXIT

detect_platform() {
  case "$(uname -s)" in
    Linux) OS_TYPE="linux" ;;
    Darwin) OS_TYPE="macos" ;;
    *) OS_TYPE="unknown" ;;
  esac
}

detect_distro() {
  if ! is_linux; then
    DISTRO_ID="$OS_TYPE"
    return
  fi

  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    DISTRO_ID="${ID,,}"
    return
  fi

  DISTRO_ID="linux"
}

run_logged() {
  log "COMMAND: $*"
  if ! "$@" >> "$LOG_FILE" 2>&1; then
    die "El comando fallo: $*"
  fi
}

require_command() {
  if ! command_exists "$1"; then
    die "Requiere '$1' pero no esta instalado. Instala la dependencia y vuelve a ejecutar este script."
  fi
}

version_ge() {
  local version_a version_b
  version_a="$1"
  version_b="$2"
  [[ "$version_a" == "$version_b" ]] && return 0

  local IFS=.
  local i a b
  read -r -a a <<< "$version_a"
  read -r -a b <<< "$version_b"

  for ((i = 0; i < ${#a[@]}; i++)); do
    if [[ -z ${b[i]:-} ]]; then
      return 0
    fi
    if ((10#${a[i]} > 10#${b[i]})); then
      return 0
    elif ((10#${a[i]} < 10#${b[i]})); then
      return 1
    fi
  done

  return 0
}

node_version_ok() {
  if ! command_exists node || ! command_exists npm; then
    return 1
  fi

  local node_version npm_version
  node_version="$(node -v 2>/dev/null | tr -d 'v')"
  npm_version="$(npm -v 2>/dev/null)"
  log "Detected node version: $node_version"
  log "Detected npm version: $npm_version"

  version_ge "$node_version" "20.0.0" && version_ge "$npm_version" "10.0.0"
}

install_node_linux() {
  require_command sudo

  if [[ "$DISTRO_ID" =~ ^(ubuntu|debian)$ ]]; then
    info "Instalando Node.js >= 20 para Debian/Ubuntu"
    run_logged sudo apt-get update -y
    run_logged sudo apt-get install -y curl ca-certificates gnupg lsb-release
    run_logged bash -lc "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    run_logged sudo apt-get install -y nodejs
    return
  fi

  if [[ "$DISTRO_ID" =~ ^(fedora|rhel|centos)$ ]]; then
    info "Instalando Node.js >= 20 para Fedora/RHEL"
    run_logged sudo dnf install -y curl
    run_logged bash -lc "curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -"
    run_logged sudo dnf install -y nodejs
    return
  fi

  if [[ "$DISTRO_ID" == "arch" ]]; then
    info "Instalando Node.js para Arch Linux"
    run_logged sudo pacman -Sy --noconfirm nodejs npm
    return
  fi

  if [[ "$DISTRO_ID" =~ ^(opensuse|suse)$ ]]; then
    info "Instalando Node.js para openSUSE"
    run_logged sudo zypper refresh
    run_logged sudo zypper install -yn nodejs npm
    return
  fi

  die "Distribucion Linux no soportada para instalacion automatica: $DISTRO_ID. Instala Node.js >= 20 manualmente."
}

install_node_macos() {
  if command_exists brew; then
    info "Instalando Node.js usando Homebrew"
    run_logged brew update
    run_logged brew install node
    return
  fi

  die "Homebrew no esta instalado. Instala Homebrew o Node.js >= 20 manualmente para continuar."
}

install_unzip_if_needed() {
  if command_exists unzip || command_exists python3; then
    return
  fi

  warn "unzip no encontrado. Intentaremos instalar unzip si es posible."

  if is_linux; then
    require_command sudo
    if [[ "$DISTRO_ID" =~ ^(ubuntu|debian)$ ]]; then
      run_logged sudo apt-get install -y unzip
    elif [[ "$DISTRO_ID" =~ ^(fedora|rhel|centos)$ ]]; then
      run_logged sudo dnf install -y unzip
    elif [[ "$DISTRO_ID" == "arch" ]]; then
      run_logged sudo pacman -Sy --noconfirm unzip
    elif [[ "$DISTRO_ID" =~ ^(opensuse|suse)$ ]]; then
      run_logged sudo zypper install -yn unzip
    else
      die "No se puede instalar unzip automaticamente en esta distribucion. Instala unzip o python3 manualmente."
    fi
    return
  fi

  if is_macos && command_exists brew; then
    run_logged brew install unzip
    return
  fi

  die "Necesitas unzip o python3 para extraer el repositorio."
}

install_prerequisites() {
  require_command curl

  if ! node_version_ok; then
    if is_linux; then
      install_node_linux
    elif is_macos; then
      install_node_macos
    else
      die "Plataforma no soportada: $OS_TYPE"
    fi
  else
    success "Node.js y npm ya estan instalados."
  fi

  install_unzip_if_needed
}

download_repository() {
  info "Descargando AI Workspace Manager desde GitHub"
  run_logged curl -fsSL "$ZIP_URL" -o "$TMP_ZIP"
  success "Repositorio descargado"
}

extract_repository() {
  info "Extrayendo el repositorio"
  mkdir -p "$TMP_DIR"

  if command_exists unzip; then
    run_logged unzip -q "$TMP_ZIP" -d "$TMP_DIR"
  elif command_exists python3; then
    run_logged python3 - "$TMP_ZIP" "$TMP_DIR" <<'PY'
import sys
import zipfile

with zipfile.ZipFile(sys.argv[1], 'r') as archive:
    archive.extractall(sys.argv[2])
PY
  else
    die "No se encontro unzip ni python3 para extraer el ZIP."
  fi

  local extracted_subdir
  extracted_subdir="$(find "$TMP_DIR" -maxdepth 1 -mindepth 1 -type d | head -n 1)"
  if [[ -z "$extracted_subdir" ]]; then
    die "No se encontro la carpeta extraida del repositorio."
  fi

  if [[ -d "$TARGET_FOLDER" ]]; then
    local backup_folder="${TARGET_FOLDER}.backup-$(date +%Y%m%d-%H%M%S)"
    warn "Instalacion existente detectada. Creando backup en: $backup_folder"
    run_logged mv "$TARGET_FOLDER" "$backup_folder"
    success "Backup creado"
  fi

  run_logged mv "$extracted_subdir" "$TARGET_FOLDER"
  success "Repositorio movido a $TARGET_FOLDER"
}

prepare_project() {
  info "Preparando el proyecto"
  cd "$TARGET_FOLDER"
  if [[ ! -f ".env" && -f ".env.example" ]]; then
    run_logged cp .env.example .env
    success ".env creado a partir de .env.example"
  fi
}

install_dependencies() {
  info "Instalando dependencias del proyecto"
  cd "$TARGET_FOLDER"

  if is_linux; then
    export ELECTRON_SKIP_BINARY_DOWNLOAD=1
    export AIWM_SKIP_ELECTRON_REPAIR=1
    export AIWM_HEADLESS_WEB=1
  fi

  if [[ -f "package-lock.json" ]]; then
    run_logged npm ci
  else
    warn "package-lock.json no se encontro. Se usara npm install."
    run_logged npm install
  fi

  success "Dependencias instaladas"
}

repair_electron() {
  if [[ -f "package.json" && $(grep -q 'electron:repair' package.json && echo yes || true) == "yes" ]]; then
    info "Verificando y reparando Electron"
    run_logged npm run electron:repair
    success "Electron reparado"
  else
    warn "No se encontro el script electron:repair en package.json. Omitiendo reparacion."
  fi
}

setup_database() {
  info "Generando Prisma y aplicando esquema SQLite"
  cd "$TARGET_FOLDER"
  run_logged npm run prisma:generate
  run_logged npm run db:push
  success "Base de datos lista"
}

move_log_to_target() {
  if [[ -n "$LOG_FILE" && -f "$LOG_FILE" ]]; then
    local final_log="$TARGET_FOLDER/install.log"
    mkdir -p "$TARGET_FOLDER"
    mv "$LOG_FILE" "$final_log"
    LOG_FILE="$final_log"
    success "Registro de instalacion guardado en $LOG_FILE"
  fi
}

start_background() {
  local name log_path
  name="$1"
  log_path="$2"
  shift 2

  log "START BACKGROUND: $name -> $*"
  if command_exists nohup; then
    nohup "$@" > "$log_path" 2>&1 &
  else
    "$@" > "$log_path" 2>&1 &
  fi

  local pid=$!
  success "$name iniciado en segundo plano. PID: $pid"
}

open_browser() {
  local url="$1"
  if is_wsl && command_exists wslview; then
    wslview "$url" >/dev/null 2>&1 &
  elif command_exists xdg-open; then
    xdg-open "$url" >/dev/null 2>&1 &
  elif is_macos && command_exists open; then
    open "$url" >/dev/null 2>&1 &
  else
    warn "No se encontro un comando para abrir el navegador automaticamente."
  fi
}

start_application() {
  if [[ "$START_APP" != "true" ]]; then
    warn "START_APP esta deshabilitado. La aplicacion no se iniciara automaticamente."
    return
  fi

  cd "$TARGET_FOLDER"
  if is_linux; then
    local url="http://localhost:$FRONTEND_PORT"
    info "Iniciando modo web headless para Linux/WSL"
    start_background "Servidor backend" "$TARGET_FOLDER/server.log" env PORT="$BACKEND_PORT" HOST="127.0.0.1" npm run web:server
    start_background "Frontend Vite" "$TARGET_FOLDER/web.log" npm run web:dev -- --host 0.0.0.0 --port "$FRONTEND_PORT"

    echo "=============================================================="
    echo " AI Workspace Manager esta listo en modo web headless."
    echo " Abre tu navegador en: $url"
    echo " Backend:  http://localhost:$BACKEND_PORT"
    echo " Logs:     $TARGET_FOLDER/server.log y $TARGET_FOLDER/web.log"
    echo "=============================================================="
    open_browser "$url"
    return
  fi

  info "Iniciando la aplicacion Electron"
  run_logged npm run dev
}

print_header() {
  printf "%b\n" "$COLOR_CYAN"
  echo "=============================================================="
  echo "  AI Workspace Manager - Instalador Linux / macOS profesional  "
  echo "=============================================================="
  printf "%b\n" "$COLOR_RESET"
  echo "Linux/WSL usa servidor Node + frontend web en el navegador."
  echo "macOS usa el flujo Electron de escritorio."
  echo
}

main() {
  create_temp_paths
  detect_platform
  detect_distro
  print_header
  info "Plataforma detectada: $OS_TYPE ($DISTRO_ID)"
  info "Carpeta de instalacion: $TARGET_FOLDER"

  install_prerequisites
  download_repository
  extract_repository
  prepare_project
  install_dependencies

  if ! is_linux; then
    repair_electron
  fi

  setup_database
  move_log_to_target

  success "Instalacion completada correctamente"
  printf "%b\n" "$COLOR_SUCCESS"
  echo "Proyecto instalado en: $TARGET_FOLDER"
  echo "Registro disponible en: $LOG_FILE"
  printf "%b\n" "$COLOR_RESET"

  start_application
}

main "$@"
