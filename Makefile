# MSA RabbitMQ Demo Makefile

.PHONY: help build up down logs clean test health register-user

# Default target
help:
	@echo "MSA RabbitMQ Demo - Available commands:"
	@echo ""
	@echo "  build          - Build all Docker images"
	@echo "  up             - Start all services"
	@echo "  down           - Stop all services"
	@echo "  restart        - Restart all services"
	@echo "  logs           - Show logs for all services"
	@echo "  logs-follow    - Follow logs for all services"
	@echo "  clean          - Stop services and remove volumes"
	@echo "  clean-all      - Clean everything including images"
	@echo "  health         - Check health of all services"
	@echo "  status         - Show service status"
	@echo "  register-user  - Register a test user"
	@echo "  rabbitmq-ui    - Open RabbitMQ management UI"
	@echo "  dev-setup      - Setup for local development"
	@echo "  test           - Run tests"
	@echo ""

# Build all images
build:
	@echo "Building Docker images..."
	docker-compose build

# Start all services
up:
	@echo "Starting all services..."
	docker-compose up -d
	@echo "Services are starting up..."
	@echo "API Gateway: http://localhost:3000"
	@echo "RabbitMQ UI: http://localhost:15672 (admin/admin123)"

# Stop all services
down:
	@echo "Stopping all services..."
	docker-compose down

# Restart all services
restart: down up

# Show logs
logs:
	docker-compose logs

# Follow logs
logs-follow:
	docker-compose logs -f

# Show logs for specific service
logs-gateway:
	docker-compose logs -f api-gateway

logs-user:
	docker-compose logs -f user-service

logs-email:
	docker-compose logs -f email-service

logs-rabbitmq:
	docker-compose logs -f rabbitmq

# Clean up containers and volumes
clean:
	@echo "Cleaning up containers and volumes..."
	docker-compose down -v
	docker system prune -f

# Clean everything including images
clean-all:
	@echo "Cleaning up everything..."
	docker-compose down -v --rmi all
	docker system prune -a -f

# Health check
health:
	@echo "Checking service health..."
	@echo "API Gateway:"
	@curl -s http://localhost:3000/health | jq . || echo "Gateway not responding"
	@echo ""
	@echo "Service Status:"
	@curl -s http://localhost:3000/services | jq . || echo "Cannot get service status"

# Show container status
status:
	@echo "Container Status:"
	docker-compose ps

# Register a test user
register-user:
	@echo "Registering test user..."
	curl -X POST http://localhost:3000/api/users/register \
		-H "Content-Type: application/json" \
		-d '{ \
			"username": "test_user", \
			"email": "test@example.com", \
			"password": "testpassword123", \
			"firstName": "Test", \
			"lastName": "User" \
		}' | jq .

# Open RabbitMQ management UI
rabbitmq-ui:
	@echo "Opening RabbitMQ Management UI..."
	@echo "URL: http://localhost:15672"
	@echo "Username: admin"
	@echo "Password: admin123"
	@command -v open >/dev/null 2>&1 && open http://localhost:15672 || \
	command -v xdg-open >/dev/null 2>&1 && xdg-open http://localhost:15672 || \
	echo "Please open http://localhost:15672 in your browser"

# Setup for local development
dev-setup:
	@echo "Setting up local development environment..."
	@echo "Starting RabbitMQ and PostgreSQL..."
	docker-compose up -d rabbitmq user-db
	@echo "Installing dependencies..."
	cd api-gateway && npm install
	cd user-service && npm install
	cd email-service && npm install
	@echo "Development setup complete!"
	@echo ""
	@echo "To start services locally:"
	@echo "  Terminal 1: cd api-gateway && npm run dev"
	@echo "  Terminal 2: cd user-service && npm run dev"
	@echo "  Terminal 3: cd email-service && npm run dev"

# Run tests (placeholder for future test implementation)
test:
	@echo "Running tests..."
	@echo "No tests implemented yet"

# Development helpers
dev-gateway:
	cd api-gateway && npm run dev

dev-user:
	cd user-service && npm run dev

dev-email:
	cd email-service && npm run dev

# Monitor commands
monitor:
	@echo "Monitoring services..."
	watch -n 2 'curl -s http://localhost:3000/health | jq .'

# Quick commands for common operations
quick-test: up
	@echo "Waiting for services to start..."
	sleep 10
	@make health
	@make register-user

# Backup and restore (for future implementation)
backup:
	@echo "Backup functionality not implemented yet"

restore:
	@echo "Restore functionality not implemented yet"

# Show API documentation
docs:
	@echo "API Documentation:"
	curl -s http://localhost:3000/docs | jq .

# Environment info
env-info:
	@echo "Environment Information:"
	@echo "Docker version:"
	docker --version
	@echo "Docker Compose version:"
	docker-compose --version
	@echo "Node.js version (if available):"
	node --version 2>/dev/null || echo "Node.js not found"
	@echo "System info:"
	uname -a