"""
bitwarden.py
An interface to bitwarden. 
gets secrets from bitwarden.
web10 uses bitwarden as a secrets manager.
"""
import settings
import os
def get_bitwarden_secrets():
    """
        get the secrets from bitwarden.
        uses an object_id + private key from settings.
    """
    return {"nah":"nah"}

# run bitwarden as a test.
if __name__=="__main__":
    print(get_bitwarden_secrets())
