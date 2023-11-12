"""
infisical.py
using infisical to manage the secrets
"""
import infisical
import os

def get_secrets():
    """
        returns all of the web10 infisical
        secrets as a dict.
    """
    client = infisical.InfisicalClient(token=os.getenv("INFISICAL"))
    secrets = client.get_all_secrets(environment="prod")
    result = {}
    for s in secrets :
        result[s.secret_name] = s.secret_value
    return result

if __name__ == "__main__":
    print(os.getenv("INFISICAL"))
