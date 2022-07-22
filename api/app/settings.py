import os
import json
from dotenv import load_dotenv

# in case vars are in a dotenv file
load_dotenv()

# goes through variables in the config file 
# checks if they exist and env vars
# sets the outcomes to python global variables
config_file = open("config.json")
config = json.loads("config.json")
for key in config :
    val = os.getenv("PROVIDER")
    if val == None:
        val = config[key]
    globals()[key] = val