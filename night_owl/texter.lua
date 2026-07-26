-- texter.lua
-- Sends SMS on crucial events — Steve Jobs top engineer style

local http = require("hs.http")
local json = require("hs.json")

local logger = hs.logger.new("night_owl.texter", "info")

local config_dir = hs.settings.get("night_owl_config_dir")
  or os.getenv("HOME") .. "/conductor/workspaces/web10/beijing/night_owl"

local function load_config()
  local ok, data = pcall(json.decode,
    hs.fscontents.readfile(config_dir .. "/config.json"))
  return ok and data or {}
end

-- Steve Jobs top engineer messages
local messages = {
  web10web10 = {
    "Boss — need web10web10. Board's blocked. Gates need clearing. Kick it?",
    "Hey — the board's gotten messy. Need a web10web10 to realign the fleet.",
    "Operator — Qwens are stalling on gates. web10web10 time?"
  },
  gather_up = {
    "Gather up is clean. " .. "%d" .. " PRs merged, prod green. Shipping.",
    "Batch is solid. " .. "%d" .. " PRs, zero findings. Promoting to main.",
    "All green. " .. "%d" .. " PRs ready. Pushing to prod."
  },
  unbrick = {
    "K3 bricked on " .. "%s" .. ". Running unbrick! — structural fix, not a rule.",
    "Agent choked on " .. "%s" .. ". Diagnosing the failure class. Fixing the flow.",
    "Brick detected on " .. "%s" .. ". Turning it into a process fix now."
  },
  brick_detected = {
    "Heads up — K3 hit a wall on " .. "%s" .. ". Investigating.",
    "Agent stalled on " .. "%s" .. ". Sending in the big model to unbrick.",
    "Blocker on " .. "%s" .. ". Not a task issue — the system tripped it up. Fixing."
  },
  horizon_exhausted = {
    "Horizon exhausted — " .. "%d" .. " PRs landed since last intervention. Ready for next round.",
    "Fleet's burned through the queue. " .. "%d" .. " PRs in. Need fresh bites.",
    "The Qwens cleared the board. " .. "%d" .. " PRs. Time for another web10web10."
  }
}

-- Pick a random message template
local function pick_template(event)
  local pool = messages[event]
  if not pool then return nil end
  return pool[math.random(#pool)]
end

-- Format message with args
local function format_message(template, ...)
  return string.format(template, ...)
end

-- Send via Twilio
local function send_twilio(to, from, body)
  local account_sid = os.getenv("TWILIO_ACCOUNT_SID")
  local auth_token = os.getenv("TWILIO_AUTH_TOKEN")
  if not account_sid or not auth_token then
    logger.e("Twilio credentials not set")
    return false
  end

  local data = string.format(
    "From=%s&To=%s&Body=%s",
    hs.http.encodeUTF8(tostring(from)),
    hs.http.encodeUTF8(tostring(to)),
    hs.http.encodeUTF8(tostring(body))
  )

  local ok, resp = http.asyncPost(
    "https://api.twilio.com/2010-04-01/Accounts/" .. account_sid .. "/Messages.json",
    function(error, response, result)
      if error then
        logger.e("Twilio error: " .. error)
      else
        logger.i("SMS sent: " .. body)
      end
    end,
    data,
    {
      ["Authorization"] = "Basic " ..
        hs.base64.encode(account_sid .. ":" .. auth_token),
      ["Content-Type"] = "application/x-www-form-urlencoded"
    }
  )
  return ok
end

-- Send via iMessage (macScript, no API cost)
local function send_imessage(to, body)
  local escaped = body:gsub('"', '\\"')
  local script = string.format(
    'tell application "Messages" to send "%s" to buddy "%s" of (first chat service)',
    escaped, to
  )
  local ok, result = pcall(hs.osascript.applestring, script)
  if ok then
    logger.i("iMessage sent: " .. body)
  else
    logger.e("iMessage failed: " .. tostring(result))
  end
  return ok
end

-- Main send function
function M.send(event, extra)
  local cfg = load_config()
  local texting = cfg.texting or {}
  if not texting.enabled then
    logger.i("Texting disabled, would send: " .. event ..
      (extra and " " .. tostring(extra) or ""))
    return
  end

  local template = pick_template(event)
  if not template then
    logger.w("No message template for event: " .. event)
    return
  end

  local body
  if extra and type(extra) == "table" then
    body = format_message(template, unpack(extra))
  elseif extra then
    body = format_message(template, extra)
  else
    body = template
  end

  logger.i("Sending [" .. event .. "]: " .. body)

  if texting.provider == "imessage" then
    send_imessage(texting.to_phone, body)
  else
    send_twilio(texting.to_phone, texting.from_phone, body)
  end
end

return M
