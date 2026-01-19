# Azure Functions Bindings Quick Reference

Copy-paste templates for common triggers and bindings.

## HTTP Triggers

### Basic GET

```python
@app.route(route="items", methods=["GET"])
def list_items(req: func.HttpRequest) -> func.HttpResponse:
    items = get_all_items()
    return func.HttpResponse(
        json.dumps(items),
        mimetype="application/json",
    )
```

### GET with query params

```python
@app.route(route="search", methods=["GET"])
def search(req: func.HttpRequest) -> func.HttpResponse:
    query = req.params.get("q", "")
    limit = int(req.params.get("limit", "10"))

    results = search_items(query, limit)
    return func.HttpResponse(json.dumps(results), mimetype="application/json")
```

### GET with route params

```python
@app.route(route="items/{id}", methods=["GET"])
def get_item(req: func.HttpRequest) -> func.HttpResponse:
    item_id = req.route_params.get("id")
    item = get_item_by_id(item_id)

    if not item:
        return func.HttpResponse(status_code=404)

    return func.HttpResponse(json.dumps(item), mimetype="application/json")
```

### POST with JSON body

```python
@app.route(route="items", methods=["POST"])
def create_item(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid JSON"}),
            status_code=400,
            mimetype="application/json",
        )

    item = create_item(body)
    return func.HttpResponse(
        json.dumps(item),
        status_code=201,
        mimetype="application/json",
    )
```

### PUT/PATCH update

```python
@app.route(route="items/{id}", methods=["PUT", "PATCH"])
def update_item(req: func.HttpRequest) -> func.HttpResponse:
    item_id = req.route_params.get("id")
    body = req.get_json()

    updated = update_item_by_id(item_id, body)
    return func.HttpResponse(json.dumps(updated), mimetype="application/json")
```

### DELETE

```python
@app.route(route="items/{id}", methods=["DELETE"])
def delete_item(req: func.HttpRequest) -> func.HttpResponse:
    item_id = req.route_params.get("id")
    delete_item_by_id(item_id)
    return func.HttpResponse(status_code=204)
```

### File upload

```python
@app.route(route="upload", methods=["POST"])
def upload(req: func.HttpRequest) -> func.HttpResponse:
    file_content = req.get_body()
    content_type = req.headers.get("Content-Type", "application/octet-stream")
    filename = req.params.get("filename", "upload.bin")

    save_file(filename, file_content)
    return func.HttpResponse(json.dumps({"filename": filename}), mimetype="application/json")
```

## Blob Triggers & Bindings

### Blob trigger (process on upload)

```python
@app.blob_trigger(
    arg_name="blob",
    path="uploads/{name}",
    connection="AzureWebJobsStorage"
)
def process_upload(blob: func.InputStream):
    logging.info(f"Blob name: {blob.name}")
    logging.info(f"Blob size: {blob.length} bytes")

    content = blob.read()
    process(content)
```

### Blob input binding (read blob in HTTP function)

```python
@app.route(route="files/{filename}")
@app.blob_input(
    arg_name="blob",
    path="files/{filename}",
    connection="AzureWebJobsStorage"
)
def get_file(req: func.HttpRequest, blob: func.InputStream) -> func.HttpResponse:
    return func.HttpResponse(
        blob.read(),
        mimetype="application/octet-stream",
    )
```

### Blob output binding (write blob)

```python
@app.route(route="generate", methods=["POST"])
@app.blob_output(
    arg_name="output",
    path="generated/{rand-guid}.json",
    connection="AzureWebJobsStorage"
)
def generate(req: func.HttpRequest, output: func.Out[str]) -> func.HttpResponse:
    data = {"generated": True, "timestamp": str(datetime.utcnow())}
    output.set(json.dumps(data))
    return func.HttpResponse("Generated", status_code=201)
```

### Process blob and write output

```python
@app.blob_trigger(
    arg_name="input_blob",
    path="raw/{name}",
    connection="AzureWebJobsStorage"
)
@app.blob_output(
    arg_name="output_blob",
    path="processed/{name}",
    connection="AzureWebJobsStorage"
)
def transform(input_blob: func.InputStream, output_blob: func.Out[bytes]):
    content = input_blob.read()
    processed = transform_data(content)
    output_blob.set(processed)
```

## Timer Triggers (Scheduled)

### Every 5 minutes

```python
@app.timer_trigger(
    schedule="0 */5 * * * *",
    arg_name="timer",
    run_on_startup=False
)
def every_five_minutes(timer: func.TimerRequest):
    logging.info("Running scheduled task")
```

### Daily at midnight UTC

```python
@app.timer_trigger(
    schedule="0 0 0 * * *",
    arg_name="timer"
)
def daily_midnight(timer: func.TimerRequest):
    if timer.past_due:
        logging.warning("Timer is running late!")
    run_daily_job()
```

### Hourly

```python
@app.timer_trigger(schedule="0 0 * * * *", arg_name="timer")
def hourly(timer: func.TimerRequest):
    run_hourly_job()
```

### Weekdays at 9am

```python
@app.timer_trigger(
    schedule="0 0 9 * * 1-5",  # Mon-Fri at 9:00 AM
    arg_name="timer"
)
def weekday_morning(timer: func.TimerRequest):
    send_daily_report()
```

**CRON format:** `{second} {minute} {hour} {day} {month} {day-of-week}`

## Queue Triggers & Bindings

### Queue trigger

```python
@app.queue_trigger(
    arg_name="msg",
    queue_name="tasks",
    connection="AzureWebJobsStorage"
)
def process_task(msg: func.QueueMessage):
    task = json.loads(msg.get_body().decode())
    logging.info(f"Processing task: {task['id']}")
    execute_task(task)
```

### Queue output (send message)

```python
@app.route(route="enqueue", methods=["POST"])
@app.queue_output(
    arg_name="msg",
    queue_name="tasks",
    connection="AzureWebJobsStorage"
)
def enqueue(req: func.HttpRequest, msg: func.Out[str]) -> func.HttpResponse:
    task = req.get_json()
    msg.set(json.dumps(task))
    return func.HttpResponse("Queued", status_code=202)
```

### Multiple queue outputs

```python
@app.route(route="distribute", methods=["POST"])
@app.queue_output(arg_name="queue1", queue_name="high-priority", connection="AzureWebJobsStorage")
@app.queue_output(arg_name="queue2", queue_name="low-priority", connection="AzureWebJobsStorage")
def distribute(req: func.HttpRequest, queue1: func.Out[str], queue2: func.Out[str]):
    task = req.get_json()
    if task.get("priority") == "high":
        queue1.set(json.dumps(task))
    else:
        queue2.set(json.dumps(task))
    return func.HttpResponse("Distributed")
```

## Event Grid Triggers

### Basic Event Grid trigger

```python
@app.event_grid_trigger(arg_name="event")
def handle_event(event: func.EventGridEvent):
    logging.info(f"Event type: {event.event_type}")
    logging.info(f"Event subject: {event.subject}")
    logging.info(f"Event ID: {event.id}")

    data = event.get_json()
    process_event(data)
```

### Filter by event type

```python
@app.event_grid_trigger(arg_name="event")
def on_blob_created(event: func.EventGridEvent):
    if event.event_type != "Microsoft.Storage.BlobCreated":
        return

    data = event.get_json()
    blob_url = data.get("url")
    logging.info(f"New blob created: {blob_url}")
```

### Parse blob created event

```python
@app.event_grid_trigger(arg_name="event")
def on_storage_event(event: func.EventGridEvent):
    data = event.get_json()

    # Common fields for storage events
    api = data.get("api")                    # e.g., "PutBlob"
    blob_type = data.get("blobType")         # e.g., "BlockBlob"
    content_type = data.get("contentType")   # e.g., "application/json"
    content_length = data.get("contentLength")
    url = data.get("url")

    # Parse URL to get container and blob name
    # https://account.blob.core.windows.net/container/path/to/blob.json
    from urllib.parse import urlparse
    parsed = urlparse(url)
    path_parts = parsed.path.split("/")
    container = path_parts[1]
    blob_name = "/".join(path_parts[2:])

    logging.info(f"Container: {container}, Blob: {blob_name}")
```

## Table Storage Bindings

### Table input (read)

```python
@app.route(route="users/{id}")
@app.table_input(
    arg_name="user",
    table_name="users",
    row_key="{id}",
    partition_key="users",
    connection="AzureWebJobsStorage"
)
def get_user(req: func.HttpRequest, user: str) -> func.HttpResponse:
    if not user:
        return func.HttpResponse(status_code=404)
    return func.HttpResponse(user, mimetype="application/json")
```

### Table output (write)

```python
@app.route(route="users", methods=["POST"])
@app.table_output(
    arg_name="user",
    table_name="users",
    connection="AzureWebJobsStorage"
)
def create_user(req: func.HttpRequest, user: func.Out[str]) -> func.HttpResponse:
    body = req.get_json()
    entity = {
        "PartitionKey": "users",
        "RowKey": str(uuid.uuid4()),
        **body
    }
    user.set(json.dumps(entity))
    return func.HttpResponse(json.dumps(entity), status_code=201)
```

## Cosmos DB Bindings

### Cosmos DB trigger (change feed)

```python
@app.cosmos_db_trigger(
    arg_name="documents",
    container_name="items",
    database_name="mydb",
    connection="CosmosDBConnection",
    lease_container_name="leases",
    create_lease_container_if_not_exists=True
)
def on_change(documents: func.DocumentList):
    for doc in documents:
        logging.info(f"Changed document: {doc.to_dict()}")
```

### Cosmos DB input

```python
@app.route(route="items/{id}")
@app.cosmos_db_input(
    arg_name="document",
    container_name="items",
    database_name="mydb",
    connection="CosmosDBConnection",
    id="{id}",
    partition_key="{id}"
)
def get_item(req: func.HttpRequest, document: func.DocumentList) -> func.HttpResponse:
    if not document:
        return func.HttpResponse(status_code=404)
    return func.HttpResponse(json.dumps(document[0].to_dict()), mimetype="application/json")
```

### Cosmos DB output

```python
@app.route(route="items", methods=["POST"])
@app.cosmos_db_output(
    arg_name="document",
    container_name="items",
    database_name="mydb",
    connection="CosmosDBConnection"
)
def create_item(req: func.HttpRequest, document: func.Out[func.Document]) -> func.HttpResponse:
    body = req.get_json()
    body["id"] = str(uuid.uuid4())
    document.set(func.Document.from_dict(body))
    return func.HttpResponse(json.dumps(body), status_code=201)
```

## Service Bus Triggers

### Queue trigger

```python
@app.service_bus_queue_trigger(
    arg_name="msg",
    queue_name="tasks",
    connection="ServiceBusConnection"
)
def process_queue(msg: func.ServiceBusMessage):
    body = msg.get_body().decode()
    logging.info(f"Message: {body}")
```

### Topic subscription trigger

```python
@app.service_bus_topic_trigger(
    arg_name="msg",
    topic_name="events",
    subscription_name="processor",
    connection="ServiceBusConnection"
)
def process_topic(msg: func.ServiceBusMessage):
    body = json.loads(msg.get_body().decode())
    logging.info(f"Event: {body}")
```

## Durable Functions (Orchestration)

### Activity function

```python
@app.activity_trigger(input_name="payload")
def process_step(payload: dict) -> dict:
    result = do_work(payload)
    return {"status": "complete", "result": result}
```

### Orchestrator function

```python
import azure.durable_functions as df

@app.orchestration_trigger(context_name="context")
def orchestrator(context: df.DurableOrchestrationContext):
    input_data = context.get_input()

    # Call activities in sequence
    step1 = yield context.call_activity("process_step", {"step": 1})
    step2 = yield context.call_activity("process_step", {"step": 2})

    # Or in parallel
    tasks = [
        context.call_activity("process_step", {"item": i})
        for i in range(10)
    ]
    results = yield context.task_all(tasks)

    return {"completed": True, "results": results}
```

### HTTP starter

```python
@app.route(route="orchestrators/{name}")
@app.durable_client_input(client_name="client")
async def start_orchestrator(
    req: func.HttpRequest,
    client: df.DurableOrchestrationClient
) -> func.HttpResponse:
    instance_id = await client.start_new(
        req.route_params.get("name"),
        instance_id=None,
        client_input=req.get_json()
    )
    return client.create_check_status_response(req, instance_id)
```
