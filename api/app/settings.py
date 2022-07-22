import os
import json

# goes through variables in the config file 
# checks if they exist and env vars
# sets the outcomes to python global variables
config_file = open("config.json")
config = json.loads("config.json")
for key in config :
    val = os.environ.get("PROVIDER")
    if val == None:
        val = config[key]
    globals()[key] = val