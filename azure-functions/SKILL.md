---
name: azure-functions
description: |
  Expert guidance for developing and deploying Azure Functions in Python.
  Covers local development with Azurite, testing, debugging, deployment to Azure,
  and infrastructure with Terraform/OpenTofu. Use when:
  (1) Creating new Azure Functions (HTTP, Blob, Timer, Event Grid triggers)
  (2) Setting up local development environment with Azurite
  (3) Debugging function execution issues
  (4) Deploying functions to Azure (dev/staging/prod)
  (5) Configuring function app settings and bindings
  (6) Setting up CI/CD for Azure Functions
  (7) Troubleshooting common Azure Functions errors
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - WebFetch
  - WebSearch
---

# Azure Functions Development & Deployment

Expert guidance for building Python Azure Functions with local development, testing, and cloud deployment.

## Prerequisites

```bash
# Install Azure Functions Core Tools (required for local dev and deployment)
brew install azure-functions-core-tools@4  # macOS
# or: npm install -g azure-functions-core-tools@4

# Install Azure CLI (for deployment and resource management)
brew install azure-cli  # macOS
az login  # Authenticate

# Python requirements
uv pip install azure-functions
```

## Quick Reference

| Task | Command |
|------|---------|
| Create new function app | `func init <name> --python -m V2` |
| Add HTTP trigger | `func new --name MyFunction --template "HTTP trigger"` |
| Run locally | `func start` |
| Deploy to Azure | `func azure functionapp publish <app-name> --python` |
| View logs | `func azure functionapp logstream <app-name>` |

## Project Structure

```
functions/
├── function_app.py       # Main app (v2 programming model)
├── host.json             # Runtime configuration
├── local.settings.json   # Local environment variables (DO NOT COMMIT)
├── requirements.txt      # Python dependencies
└── .funcignore           # Files to exclude from deployment
```

## Programming Model (v2 - Recommended)

Azure Functions v2 programming model uses decorators for cleaner code:

### HTTP Trigger

```python
import azure.functions as func
import json

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)

@app.route(route="hello", methods=["GET", "POST"])
def hello(req: func.HttpRequest) -> func.HttpResponse:
    """Simple HTTP trigger function."""
    name = req.params.get("name") or "World"

    return func.HttpResponse(
        json.dumps({"message": f"Hello, {name}!"}),
        mimetype="application/json",
    )

@app.route(route="users/{id}", methods=["GET"])
def get_user(req: func.HttpRequest) -> func.HttpResponse:
    """HTTP trigger with route parameter."""
    user_id = req.route_params.get("id")
    return func.HttpResponse(f"User ID: {user_id}")
```

### Blob Trigger

```python
@app.blob_trigger(arg_name="blob", path="raw/{name}",
                  connection="AzureWebJobsStorage")
def process_blob(blob: func.InputStream):
    """Triggered when blob is uploaded to raw/ container."""
    logging.info(f"Processing blob: {blob.name}, Size: {blob.length} bytes")
    content = blob.read()
    # Process content...

@app.blob_output(arg_name="output", path="processed/{name}",
                 connection="AzureWebJobsStorage")
def process_and_save(blob: func.InputStream, output: func.Out[bytes]):
    """Process input blob and write to output."""
    content = blob.read()
    processed = transform(content)
    output.set(processed)
```

### Timer Trigger (Cron)

```python
@app.timer_trigger(schedule="0 */5 * * * *", arg_name="timer",
                   run_on_startup=False)
def scheduled_task(timer: func.TimerRequest):
    """Run every 5 minutes."""
    if timer.past_due:
        logging.warning("Timer is past due!")
    logging.info("Timer trigger executed")
```

### Event Grid Trigger

```python
@app.event_grid_trigger(arg_name="event")
def handle_event(event: func.EventGridEvent):
    """Handle Event Grid events (e.g., blob created)."""
    logging.info(f"Event type: {event.event_type}")
    logging.info(f"Subject: {event.subject}")
    data = event.get_json()
    # Process event data...
```

### Queue Trigger

```python
@app.queue_trigger(arg_name="msg", queue_name="myqueue",
                   connection="AzureWebJobsStorage")
def process_queue(msg: func.QueueMessage):
    """Process messages from Azure Queue Storage."""
    logging.info(f"Message: {msg.get_body().decode()}")
```

## Configuration Files

### host.json

```json
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "excludedTypes": "Request"
      }
    },
    "logLevel": {
      "default": "Information",
      "Host.Results": "Error",
      "Function": "Information"
    }
  },
  "extensions": {
    "http": {
      "routePrefix": ""
    }
  },
  "functionTimeout": "00:10:00",
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
```

**Key settings:**
- `routePrefix`: Set to `""` to remove `/api/` prefix from routes
- `functionTimeout`: Max execution time (default 5min, max 10min on Consumption)
- `extensionBundle`: Required for bindings (blob, queue, etc.)

### local.settings.json

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "python",
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "AzureWebJobsFeatureFlags": "EnableWorkerIndexing",
    "MY_CONNECTION_STRING": "...",
    "ENV": "local"
  },
  "Host": {
    "CORS": "*",
    "CORSCredentials": false
  }
}
```

**IMPORTANT:** Never commit `local.settings.json` - add to `.gitignore`

### .funcignore

```
.git*
.vscode
__azurite_*
local.settings.json
test-data/
tests/
.venv/
__pycache__/
*.pyc
.pytest_cache/
```

## Local Development

### 1. Start Azurite (Local Blob Storage)

```bash
# Option A: Docker (recommended)
docker run -d -p 10000:10000 -p 10001:10001 -p 10002:10002 \
  mcr.microsoft.com/azure-storage/azurite

# Option B: npm
npm install -g azurite
azurite --silent --location ./azurite-data --debug ./azurite-debug.log
```

### 2. Run Functions Locally

```bash
cd functions
func start

# With verbose logging
func start --verbose

# On specific port
func start --port 7071
```

### 3. Test Endpoints

```bash
# HTTP GET
curl http://localhost:7071/api/hello?name=World

# HTTP POST with JSON
curl -X POST http://localhost:7071/api/process \
  -H "Content-Type: application/json" \
  -d '{"data": "test"}'

# With function key (if auth level is FUNCTION)
curl "http://localhost:7071/api/hello?code=<function-key>"
```

### 4. Debug in VS Code

`.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Attach to Python Functions",
      "type": "python",
      "request": "attach",
      "port": 9091,
      "preLaunchTask": "func: host start"
    }
  ]
}
```

## Deployment

### Deploy to Azure

```bash
# Basic deployment
func azure functionapp publish <app-name> --python

# With build (installs dependencies)
func azure functionapp publish <app-name> --python --build remote

# Slot deployment (staging)
func azure functionapp publish <app-name> --python --slot staging
```

### Configure App Settings

```bash
# Set single setting
az functionapp config appsettings set \
  --name <app-name> \
  --resource-group <rg-name> \
  --settings "MY_SETTING=value"

# Set multiple settings from file
az functionapp config appsettings set \
  --name <app-name> \
  --resource-group <rg-name> \
  --settings @settings.json

# List current settings
az functionapp config appsettings list \
  --name <app-name> \
  --resource-group <rg-name>
```

### View Logs

```bash
# Live log stream
func azure functionapp logstream <app-name>

# Application Insights (if configured)
az monitor app-insights query \
  --app <app-insights-name> \
  --analytics-query "traces | where timestamp > ago(1h) | take 100"
```

## Infrastructure (Terraform/OpenTofu)

### Function App Module

```hcl
resource "azurerm_service_plan" "functions" {
  name                = "${var.prefix}-plan"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "Y1"  # Consumption plan
}

resource "azurerm_linux_function_app" "processors" {
  name                = "${var.prefix}-processors"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  storage_account_name       = azurerm_storage_account.main.name
  storage_account_access_key = azurerm_storage_account.main.primary_access_key
  service_plan_id            = azurerm_service_plan.functions.id

  site_config {
    application_stack {
      python_version = "3.11"
    }
    cors {
      allowed_origins = ["https://example.com"]
    }
  }

  app_settings = {
    "FUNCTIONS_WORKER_RUNTIME"       = "python"
    "AzureWebJobsFeatureFlags"       = "EnableWorkerIndexing"
    "SCM_DO_BUILD_DURING_DEPLOYMENT" = "true"
    "ENABLE_ORYX_BUILD"              = "true"
    "ENV"                            = var.environment
    # Add your custom settings here
  }

  identity {
    type = "SystemAssigned"
  }
}
```

### SKU Options

| SKU | Description | Use Case |
|-----|-------------|----------|
| `Y1` | Consumption (serverless) | Variable load, pay-per-execution |
| `EP1/EP2/EP3` | Premium | Always-warm, VNET, larger instances |
| `B1/S1/P1v2` | App Service | Predictable load, reserved capacity |

## Common Patterns

### Pattern 1: HTTP API with Validation

```python
from pydantic import BaseModel, ValidationError

class CreateUserRequest(BaseModel):
    name: str
    email: str

@app.route(route="users", methods=["POST"])
def create_user(req: func.HttpRequest) -> func.HttpResponse:
    try:
        data = CreateUserRequest(**req.get_json())
    except ValidationError as e:
        return func.HttpResponse(
            json.dumps({"error": e.errors()}),
            status_code=400,
            mimetype="application/json",
        )

    # Process valid data...
    return func.HttpResponse(
        json.dumps({"id": "123", "name": data.name}),
        status_code=201,
        mimetype="application/json",
    )
```

### Pattern 2: Blob Processing Pipeline

```python
from lib.storage import StorageHelper

@app.route(route="process/{path:alpha}", methods=["POST"])
def process_file(req: func.HttpRequest) -> func.HttpResponse:
    """Process a file from blob storage."""
    path = req.route_params.get("path")

    storage = StorageHelper()

    try:
        # Read input
        df = storage.read_parquet(f"raw/{path}")

        # Transform
        result = df.groupby("category").agg({"value": "sum"})

        # Write output
        storage.write_parquet(result, f"processed/{path}")

        return func.HttpResponse(
            json.dumps({"status": "success", "rows": len(result)}),
            mimetype="application/json",
        )
    except Exception as e:
        return func.HttpResponse(
            json.dumps({"status": "error", "message": str(e)}),
            status_code=500,
            mimetype="application/json",
        )
```

### Pattern 3: Event-Driven Architecture

```python
@app.event_grid_trigger(arg_name="event")
def on_blob_created(event: func.EventGridEvent):
    """React to blob creation events."""
    if event.event_type != "Microsoft.Storage.BlobCreated":
        return

    data = event.get_json()
    blob_url = data.get("url")

    # Extract container and path from URL
    # e.g., https://account.blob.core.windows.net/raw/data.json
    parts = blob_url.split("/")
    container = parts[-2]
    blob_name = parts[-1]

    logging.info(f"New blob: {container}/{blob_name}")

    # Trigger downstream processing...
```

### Pattern 4: Health Check Endpoint

```python
@app.route(route="health", methods=["GET"])
def health(req: func.HttpRequest) -> func.HttpResponse:
    """Health check for load balancer/monitoring."""
    checks = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": os.environ.get("APP_VERSION", "unknown"),
    }

    # Check dependencies
    try:
        storage = StorageHelper()
        storage.list_blobs("raw", max_results=1)
        checks["storage"] = "connected"
    except Exception as e:
        checks["storage"] = f"error: {str(e)}"
        checks["status"] = "degraded"

    status_code = 200 if checks["status"] == "healthy" else 503
    return func.HttpResponse(
        json.dumps(checks),
        status_code=status_code,
        mimetype="application/json",
    )
```

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `No functions found` | Missing `function_app.py` or decorators | Check file name and imports |
| `Module not found` | Dependency not in requirements.txt | Add to requirements.txt, redeploy |
| `Connection refused` | Azurite not running | Start Azurite: `docker compose up azurite` |
| `401 Unauthorized` | Missing/invalid function key | Check `x-functions-key` header or `code` param |
| `Timeout expired` | Function exceeded limit | Increase `functionTimeout` in host.json |
| `Storage account not found` | Invalid connection string | Check `AzureWebJobsStorage` setting |

### Debug Locally

```bash
# Enable verbose logging
func start --verbose

# Check Python environment
func start --python

# Validate function app
func validate
```

### Debug in Azure

```bash
# View live logs
func azure functionapp logstream <app-name>

# Check app settings
az functionapp config appsettings list --name <app-name> --resource-group <rg>

# Restart function app
az functionapp restart --name <app-name> --resource-group <rg>

# Check deployment status
az functionapp deployment list-publishing-profiles --name <app-name> --resource-group <rg>
```

### Performance Issues

1. **Cold starts**: Use Premium plan or keep-warm requests
2. **Memory limits**: Increase plan size or optimize code
3. **Concurrent requests**: Adjust `FUNCTIONS_WORKER_PROCESS_COUNT`
4. **Python performance**: Use async where possible, minimize imports

## Auth Levels

```python
# Anonymous - no key required (public APIs)
app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

# Function - requires function-specific key
app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)

# Admin - requires master key
app = func.FunctionApp(http_auth_level=func.AuthLevel.ADMIN)
```

Get function keys:
```bash
az functionapp keys list --name <app-name> --resource-group <rg>
```

## Testing

### Unit Tests

```python
# tests/test_functions.py
import azure.functions as func
from function_app import hello

def test_hello():
    req = func.HttpRequest(
        method="GET",
        body=b"",
        url="/api/hello",
        params={"name": "Test"},
    )
    response = hello(req)
    assert response.status_code == 200
    assert b"Test" in response.get_body()
```

### Integration Tests

```python
import requests

def test_hello_integration():
    """Test against running function app."""
    response = requests.get("http://localhost:7071/api/hello?name=Test")
    assert response.status_code == 200
    assert response.json()["message"] == "Hello, Test!"
```

## CI/CD (GitHub Actions)

```yaml
name: Deploy Azure Functions

on:
  push:
    branches: [main]
    paths:
      - 'functions/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          cd functions
          pip install -r requirements.txt

      - name: Run tests
        run: pytest tests/

      - name: Deploy to Azure
        uses: Azure/functions-action@v1
        with:
          app-name: ${{ secrets.FUNCTION_APP_NAME }}
          package: functions
          publish-profile: ${{ secrets.AZURE_FUNCTIONAPP_PUBLISH_PROFILE }}
```

## Resources

- [Azure Functions Python Developer Guide](https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-python)
- [v2 Programming Model](https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-python?tabs=get-started%2Casgi%2Capplication-level&pivots=python-mode-decorators)
- [Triggers and Bindings](https://learn.microsoft.com/en-us/azure/azure-functions/functions-triggers-bindings)
- [Best Practices](https://learn.microsoft.com/en-us/azure/azure-functions/functions-best-practices)
