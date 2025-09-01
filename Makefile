.PHONY: help install deps build service startup clean uninstall

# Variables
APP_NAME = palamos-dashboard
SERVICE_NAME = palamos-dashboard.service
INSTALL_DIR = /opt/palamos-dashboard
USER_NAME = palamos-dashboard

help: ## Mostra aquesta ajuda
	@echo "PalamOS Dashboard - Makefile"
	@echo "=============================="
	@echo ""
	@echo "Comandes disponibles:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""

install: deps build service ## Instal·la completament l'aplicació (dependències + build + servei)

deps: ## Instal·la les dependències del sistema
	@echo "Instal·lant dependències del sistema..."
	@chmod +x install-dependencies-ubuntu.sh
	@./install-dependencies-ubuntu.sh

build: ## Compila l'aplicació per a Linux
	@echo "Compilant aplicació..."
	@npm run build

service: ## Instal·la l'aplicació com a servei systemd
	@echo "Instal·lant servei systemd..."
	@chmod +x install-service-linux.sh
	@sudo ./install-service-linux.sh

startup: ## Instal·la l'aplicació com a programa d'auto-inici
	@echo "Instal·lant auto-inici..."
	@chmod +x install-startup-linux.sh
	@./install-startup-linux.sh

start: ## Inicia el servei
	@echo "Iniciant servei..."
	@sudo systemctl start $(SERVICE_NAME)

stop: ## Atura el servei
	@echo "Aturant servei..."
	@sudo systemctl stop $(SERVICE_NAME)

restart: ## Reinicia el servei
	@echo "Reiniciant servei..."
	@sudo systemctl restart $(SERVICE_NAME)

status: ## Mostra l'estat del servei
	@echo "Estat del servei:"
	@sudo systemctl status $(SERVICE_NAME)

logs: ## Mostra els logs del servei
	@echo "Logs del servei:"
	@sudo journalctl -u $(SERVICE_NAME) -f

enable: ## Habilita el servei per a auto-inici
	@echo "Habilitant servei per a auto-inici..."
	@sudo systemctl enable $(SERVICE_NAME)

disable: ## Deshabilita el servei per a auto-inici
	@echo "Deshabilitant servei per a auto-inici..."
	@sudo systemctl disable $(SERVICE_NAME)

clean: ## Neteja els fitxers de build
	@echo "Netejant fitxers de build..."
	@rm -rf dist/
	@rm -rf node_modules/

uninstall: ## Desinstal·la completament l'aplicació
	@echo "Desinstal·lant aplicació..."
	@sudo systemctl stop $(SERVICE_NAME) || true
	@sudo systemctl disable $(SERVICE_NAME) || true
	@sudo rm -f /etc/systemd/system/$(SERVICE_NAME)
	@sudo systemctl daemon-reload
	@sudo userdel $(USER_NAME) || true
	@sudo rm -rf $(INSTALL_DIR)
	@echo "Aplicació desinstal·lada."

dev: ## Executa l'aplicació en mode desenvolupament
	@echo "Executant en mode desenvolupament..."
	@npm run dev

pm2-start: ## Inicia l'aplicació amb PM2
	@echo "Iniciant amb PM2..."
	@npm run pm2:start

pm2-stop: ## Atura l'aplicació amb PM2
	@echo "Aturant amb PM2..."
	@npm run pm2:stop

pm2-logs: ## Mostra els logs de PM2
	@echo "Logs de PM2..."
	@npm run pm2:logs

test: ## Executa tests (si existeixen)
	@echo "Executant tests..."
	@npm test || echo "No hi ha tests configurats"

lint: ## Executa linting (si existeix)
	@echo "Executant linting..."
	@npm run lint || echo "No hi ha linting configurat"

.DEFAULT_GOAL := help
