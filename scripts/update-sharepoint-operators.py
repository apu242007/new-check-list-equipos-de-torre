"""Safely replace the Operadora choices through the existing SharePoint connection."""

import json
import os
import pathlib
import subprocess
import sys
import urllib.request

CHOICES = [
    "YPF",
    "PAE",
    "Pluspetrol",
    "Vista",
    "CGC",
    "Shell Argentina",
    "Tecpetrol",
    "CAPSA",
    "PCR",
    "TotalEnergies",
    "Pampa Energía",
    "Otra",
]
SITE_URL = "https://tackersrl505.sharepoint.com/sites/WellService"
SITE_ID = "tackersrl505.sharepoint.com,905a139d-0b93-4744-ad7b-b38903199802,4e4cb417-f066-4c63-a553-a47751a15707"
LIST_ID = "e428ab0c-7c28-4f15-95e0-1ab8d3439cff"
COLUMN_ID = "f9a233eb-0067-4864-9abc-51422728404e"
ENVIRONMENT = "Default-2003cd32-a447-4e58-b7f9-ada4dc293241"
PRIVATE = pathlib.Path(os.environ["LOCALAPPDATA"]) / "CodexSharePointInspection" / "flows"
FLOW_BASE = f"https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/{ENVIRONMENT}/flows"
CLI_ENV = dict(
    os.environ,
    AZURE_CONFIG_DIR=str(PRIVATE.parent / "azure"),
    PYTHONIOENCODING="utf-8",
)


def azure(method, resource, url, body=None):
    args = [
        sys.executable,
        "-m",
        "azure.cli",
        "rest",
        "--method",
        method,
        "--resource",
        resource,
        "--url",
        url,
        "--output",
        "json",
    ]
    if body is not None:
        body_path = PRIVATE / "operator-schema-request.json"
        body_path.write_text(json.dumps(body), encoding="utf-8")
        args += ["--body", "@" + str(body_path), "--headers", "Content-Type=application/json"]
    result = subprocess.run(args, env=CLI_ENV, capture_output=True, text=True, encoding="utf-8")
    if result.returncode:
        raise RuntimeError(result.stderr[:3000])
    return json.loads(result.stdout) if result.stdout.strip() else {}


def current_choices():
    column = azure(
        "GET",
        "https://graph.microsoft.com/",
        f"https://graph.microsoft.com/v1.0/sites/{SITE_ID}/lists/{LIST_ID}/columns/{COLUMN_ID}",
    )
    return column["choice"]["choices"]


def flow_definition():
    rest_body = json.dumps(
        {"__metadata": {"type": "SP.FieldChoice"}, "Choices": {"results": CHOICES}}
    )
    return {
        "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        "contentVersion": "1.0.0.0",
        "parameters": {
            "$connections": {"type": "Object", "defaultValue": {}},
            "$authentication": {"type": "SecureObject", "defaultValue": {}},
        },
        "triggers": {
            "manual": {
                "type": "Request",
                "kind": "Http",
                "inputs": {"method": "POST", "schema": {}, "triggerAuthenticationType": "All"},
            }
        },
        "actions": {
            "Update_operator_choices": {
                "type": "OpenApiConnection",
                "inputs": {
                    "host": {
                        "apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
                        "connectionName": "shared_sharepointonline",
                        "operationId": "HttpRequest",
                    },
                    "parameters": {
                        "dataset": SITE_URL,
                        "parameters/method": "POST",
                        "parameters/uri": f"_api/web/lists(guid'{LIST_ID}')/fields/getbyinternalnameortitle('Operadora')",
                        "parameters/headers": {
                            "Accept": "application/json;odata=nometadata",
                            "Content-Type": "application/json;odata=verbose",
                            "IF-MATCH": "*",
                            "X-HTTP-Method": "MERGE",
                        },
                        "parameters/body": rest_body,
                    },
                    "authentication": "@parameters('$authentication')",
                    "retryPolicy": {"type": "none"},
                },
                "runAfter": {},
            },
            "Done": {
                "type": "Response",
                "kind": "Http",
                "inputs": {"statusCode": 200, "body": {"updated": True}},
                "runAfter": {"Update_operator_choices": ["Succeeded"]},
            },
        },
        "outputs": {},
    }


def apply():
    existing = current_choices()
    allowed_previous = set(CHOICES) | {"Pampa Energ?a", "Pampa Energ\u00eda"}
    if not set(existing).issubset(allowed_previous):
        raise RuntimeError("La columna contiene opciones desconocidas; no se modificó.")
    if existing == CHOICES:
        return
    source = json.loads((PRIVATE / "create.json").read_text(encoding="utf-8-sig"))
    references = {
        "shared_sharepointonline": source["properties"]["connectionReferences"][
            "shared_sharepointonline"
        ]
    }
    properties = {
        "displayName": "TEMP | WellService | Expandir operadoras",
        "definition": flow_definition(),
        "connectionReferences": references,
        "environment": {"name": ENVIRONMENT},
        "state": "Started",
    }
    flow_id = None
    try:
        result = azure(
            "POST",
            "https://service.flow.microsoft.com/",
            FLOW_BASE + "?api-version=2016-11-01",
            {"properties": properties},
        )
        flow_id = result["name"]
        callback = azure(
            "POST",
            "https://service.flow.microsoft.com/",
            f"{FLOW_BASE}/{flow_id}/triggers/manual/listCallbackUrl?api-version=2016-11-01",
            {},
        )
        url = callback.get("response", {}).get("value") or callback.get("value")
        with urllib.request.urlopen(
            urllib.request.Request(url, data=b"{}", headers={"Content-Type": "text/plain"}),
            timeout=120,
        ) as response:
            if not json.loads(response.read()).get("updated"):
                raise RuntimeError("El flujo no confirmó la actualización.")
    finally:
        if flow_id:
            azure(
                "DELETE",
                "https://service.flow.microsoft.com/",
                f"{FLOW_BASE}/{flow_id}?api-version=2016-11-01",
            )
    if current_choices() != CHOICES:
        raise RuntimeError("La verificación posterior no coincide con el manifiesto.")


mode = sys.argv[1] if len(sys.argv) > 1 else "verify"
if mode == "plan":
    print(json.dumps({"current": current_choices(), "desired": CHOICES}, ensure_ascii=False))
elif mode == "apply":
    apply()
    print("PASS: opciones de Operadora aplicadas y verificadas; flujo temporal eliminado.")
elif mode == "verify":
    if current_choices() != CHOICES:
        raise RuntimeError("Las opciones remotas no coinciden con el manifiesto.")
    print("PASS: opciones remotas de Operadora coinciden con el manifiesto.")
else:
    raise RuntimeError("Modo esperado: plan, apply o verify.")
