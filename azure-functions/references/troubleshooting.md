# Azure Functions Troubleshooting Guide

Detailed solutions for common Azure Functions issues.

## Local Development Issues

### "No functions found in module"

**Symptoms:**
```
No job functions found. Try making your job classes and methods public.
```

**Causes & Solutions:**

1. **Wrong file name** - Must be `function_app.py` for v2 model
   ```bash
   ls functions/
   # Should show: function_app.py
   ```

2. **Missing decorator** - Functions need route/trigger decorators
   ```python
   # BAD - no decorator
   def hello(req):
       return "Hello"

   # GOOD - has decorator
   @app.route(route="hello")
   def hello(req):
       return "Hello"
   ```

3. **App not instantiated** - Need `FunctionApp()` instance
   ```python
   import azure.functions as func
   app = func.FunctionApp()  # Required!
   ```

4. **Import errors silently failing** - Check imports work
   ```bash
   cd functions
   python -c "import function_app"
   ```

### "Connection refused" to Azurite

**Symptoms:**
```
BlobServiceClient: Connection refused
azure.core.exceptions.ServiceRequestError
```

**Solutions:**

1. **Check Azurite is running:**
   ```bash
   docker ps | grep azurite
   # Or
   curl http://127.0.0.1:10000/
   ```

2. **Check connection string in local.settings.json:**
   ```json
   {
     "Values": {
       "AzureWebJobsStorage": "UseDevelopmentStorage=true"
     }
   }
   ```

3. **Use explicit connection string if needed:**
   ```json
   {
     "Values": {
       "AzureWebJobsStorage": "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;"
     }
   }
   ```

4. **Port conflict** - Azurite uses 10000, 10001, 10002
   ```bash
   lsof -i :10000  # Check what's using the port
   ```

### "Module not found" errors

**Solutions:**

1. **Check virtual environment is active:**
   ```bash
   which python
   # Should be in .venv or your project venv
   ```

2. **Install in correct environment:**
   ```bash
   cd functions
   uv pip install -r requirements.txt
   ```

3. **Check PYTHONPATH for local imports:**
   ```python
   # In function_app.py
   import sys
   import os
   sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
   ```

### Functions not reloading on code change

**Solution:** The Functions host doesn't hot-reload. Stop and restart:
```bash
# Ctrl+C to stop
func start
```

Or use `--verbose` for more output:
```bash
func start --verbose
```

## Deployment Issues

### "Error publishing function app"

**Symptoms:**
```
ERROR: Error publishing function app. Please run again with --verbose.
```

**Solutions:**

1. **Check Azure CLI login:**
   ```bash
   az login
   az account show
   ```

2. **Check function app exists:**
   ```bash
   az functionapp list --resource-group <rg-name> --query "[].name"
   ```

3. **Check Python version matches:**
   ```bash
   # Local
   python --version
   # Azure (should match)
   az functionapp config show --name <app-name> --resource-group <rg> \
     --query "linuxFxVersion"
   ```

4. **Try with remote build:**
   ```bash
   func azure functionapp publish <app-name> --python --build remote
   ```

### "SCM_RUN_FROM_PACKAGE" errors

**Symptoms:**
- Deployment succeeds but functions don't appear
- "Function not found" after deployment

**Solutions:**

1. **Disable run-from-package and rebuild:**
   ```bash
   az functionapp config appsettings set \
     --name <app-name> \
     --resource-group <rg> \
     --settings "SCM_DO_BUILD_DURING_DEPLOYMENT=true" \
                "ENABLE_ORYX_BUILD=true"
   ```

2. **Redeploy:**
   ```bash
   func azure functionapp publish <app-name> --python
   ```

### Dependencies not installing

**Symptoms:**
```
ModuleNotFoundError: No module named 'pandas'
```

**Solutions:**

1. **Check requirements.txt exists and has all deps:**
   ```bash
   cat functions/requirements.txt
   ```

2. **Force remote build:**
   ```bash
   func azure functionapp publish <app-name> --python --build remote
   ```

3. **Check build logs:**
   ```bash
   az functionapp log deployment show --name <app-name> --resource-group <rg>
   ```

## Runtime Issues

### Function timing out

**Symptoms:**
```
Timeout value of 00:05:00 exceeded by function
```

**Solutions:**

1. **Increase timeout in host.json:**
   ```json
   {
     "functionTimeout": "00:10:00"
   }
   ```

2. **Note limits by plan:**
   - Consumption: Max 10 minutes
   - Premium: Max 60 minutes (can be unlimited)
   - App Service: Max 30 minutes (can be unlimited)

3. **Consider async patterns for long operations:**
   - Use Durable Functions
   - Queue-based processing
   - Break into smaller functions

### Cold start delays

**Symptoms:** First request after idle takes 10-30+ seconds

**Solutions:**

1. **Use Premium plan** (always-warm instances)

2. **Add warm-up endpoint:**
   ```python
   @app.route(route="warmup", methods=["GET"])
   def warmup(req):
       # Pre-load expensive imports
       import pandas
       import numpy
       return func.HttpResponse("warmed up")
   ```

3. **Reduce package size:**
   - Only include needed dependencies
   - Use `.funcignore` to exclude dev files

4. **Use keep-alive requests** from external monitoring

### Memory issues

**Symptoms:**
```
System.OutOfMemoryException
Worker process exited
```

**Solutions:**

1. **Stream large files instead of loading:**
   ```python
   # BAD - loads entire file
   content = blob.read()

   # GOOD - stream processing
   for chunk in blob.read_chunks():
       process(chunk)
   ```

2. **Increase memory (Premium/App Service):**
   ```bash
   az functionapp plan update --name <plan> --resource-group <rg> --sku EP2
   ```

3. **Process in batches:**
   ```python
   for batch in pd.read_parquet(path, chunksize=10000):
       process(batch)
   ```

### 401 Unauthorized

**Solutions:**

1. **Check auth level matches:**
   ```python
   # If ANONYMOUS, no key needed
   app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

   # If FUNCTION, need function key
   app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)
   ```

2. **Get function key:**
   ```bash
   az functionapp function keys list \
     --name <app-name> \
     --resource-group <rg> \
     --function-name <function-name>
   ```

3. **Use key in request:**
   ```bash
   curl "https://<app>.azurewebsites.net/api/hello?code=<key>"
   # Or
   curl -H "x-functions-key: <key>" "https://<app>.azurewebsites.net/api/hello"
   ```

## Logging & Debugging

### Enable verbose logging

**In host.json:**
```json
{
  "logging": {
    "logLevel": {
      "default": "Debug",
      "Function": "Debug",
      "Host.Results": "Debug"
    }
  }
}
```

### View logs in Azure

```bash
# Live stream
func azure functionapp logstream <app-name>

# App Insights query
az monitor app-insights query \
  --app <app-insights-name> \
  --analytics-query "
    traces
    | where timestamp > ago(1h)
    | where customDimensions.Category contains 'Function'
    | project timestamp, message, customDimensions
    | order by timestamp desc
    | take 50
  "
```

### Add custom logging

```python
import logging

@app.route(route="process")
def process(req: func.HttpRequest) -> func.HttpResponse:
    logging.info(f"Processing request: {req.url}")
    logging.debug(f"Request body: {req.get_body()}")

    try:
        result = do_work()
        logging.info(f"Success: {result}")
    except Exception as e:
        logging.exception(f"Failed: {e}")
        raise

    return func.HttpResponse("OK")
```

## Blob Trigger Issues

### Blob trigger not firing

**Solutions:**

1. **Check blob path pattern matches:**
   ```python
   # Triggers on ANY file in raw/
   @app.blob_trigger(path="raw/{name}", ...)

   # Triggers only on .json files
   @app.blob_trigger(path="raw/{name}.json", ...)
   ```

2. **Check connection string:**
   ```json
   {
     "Values": {
       "AzureWebJobsStorage": "<connection-string>",
       "MyStorageConnection": "<same-or-different-connection>"
     }
   }
   ```

3. **Check blob exists in correct container:**
   ```bash
   az storage blob list --container-name raw --connection-string "<conn>"
   ```

4. **Check Event Grid subscription (if using):**
   ```bash
   az eventgrid event-subscription list --source-resource-id <storage-account-id>
   ```

### Blob trigger processing same file multiple times

**Cause:** Default blob trigger uses polling and can have duplicates

**Solutions:**

1. **Use Event Grid trigger instead** (more reliable):
   ```python
   @app.event_grid_trigger(arg_name="event")
   def on_blob(event: func.EventGridEvent):
       # Process event
   ```

2. **Implement idempotency:**
   ```python
   processed_blobs = set()  # Or use Redis/Table Storage

   @app.blob_trigger(path="raw/{name}")
   def process(blob: func.InputStream):
       if blob.name in processed_blobs:
           logging.info(f"Already processed: {blob.name}")
           return
       # Process...
       processed_blobs.add(blob.name)
   ```

## Event Grid Issues

### Events not reaching function

**Solutions:**

1. **Verify endpoint URL:**
   ```
   https://<app>.azurewebsites.net/runtime/webhooks/eventgrid?functionName=<function-name>&code=<system-key>
   ```

2. **Get system key:**
   ```bash
   az functionapp keys list --name <app-name> --resource-group <rg> --query systemKeys
   ```

3. **Check Event Grid subscription:**
   ```bash
   az eventgrid event-subscription show \
     --name <subscription-name> \
     --source-resource-id <storage-account-id>
   ```

4. **Check dead letter queue** for failed deliveries

## Quick Diagnostic Commands

```bash
# Check function app status
az functionapp show --name <app-name> --resource-group <rg> --query state

# List all functions
az functionapp function list --name <app-name> --resource-group <rg>

# Check app settings
az functionapp config appsettings list --name <app-name> --resource-group <rg>

# Check Python version
az functionapp config show --name <app-name> --resource-group <rg> --query linuxFxVersion

# Restart app
az functionapp restart --name <app-name> --resource-group <rg>

# Check recent deployments
az functionapp deployment list --name <app-name> --resource-group <rg>

# Get function URL with key
az functionapp function show \
  --name <app-name> \
  --resource-group <rg> \
  --function-name <function-name> \
  --query invokeUrlTemplate
```
