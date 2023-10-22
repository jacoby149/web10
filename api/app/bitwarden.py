"""
bitwarden.py
An interface to bitwarden. 
gets secrets from bitwarden.
web10 uses bitwarden as a secrets manager.
"""
import subprocess
import json
import os

def get_secrets():
    """
        get the secrets from bitwarden.
        uses a BITWARDEN_OBJECT_ID env var.
        for this to work, the bitwarden cli needs to be logged in.
    """
    bitwarden_object_id = os.getenv('BITWARDEN_OBJECT_ID')
    cmd = f"bw get item {bitwarden_object_id}"
    output = subprocess.check_output(cmd,shell=True ) 
    output = output.decode("utf-8")
    bw_cli_response = json.loads(output)
    fields = bw_cli_response["fields"]
    secrets = {}
    for field in fields:
        secrets[field["name"]]= field["value"]
    return secrets

