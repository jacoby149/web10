-- conductor_agent.lua
-- Screenshot → AI vision → actions pipeline

local http = require("hs.http")
local json = require("hs.json")
local shell = require("hs.shellscript")

local logger = hs.logger.new("night_owl.agent", "info")

local config_dir = hs.settings.get("night_owl_config_dir")
  or os.getenv("HOME") .. "/conductor/workspaces/web10/beijing/night_owl"

local function load_config()
  local ok, data = pcall(json.decode,
    hs.fscontents.readfile(config_dir .. "/config.json"))
  return ok and data or {}
end

-- Image to base64
local function image_to_base64(path)
  local ok, result = pcall(shell.applestring, 'base64 -i "' .. path .. '"')
  return ok and result:gsub("%s+", "") or nil
end

-- Anthropic vision API
local function call_anthropic(png_path, system_prompt, callback)
  local api_key = os.getenv("VISION_API_KEY")
  if not api_key then
    logger.e("VISION_API_KEY not set")
    callback(nil)
    return
  end

  local b64 = image_to_base64(png_path)
  if not b64 then
    logger.e("Failed to encode image")
    callback(nil)
    return
  end

  local body = json.encode({
    model = "claude-sonnet-4-20250514",
    max_tokens = 1024,
    system = system_prompt or
      "You see a screenshot of the Conductor Mac app. Return a JSON array of actions. " ..
      "Types: click(x,y), type(text), press(key), wait(seconds), screenshot, text(event,message), done. " ..
      "Be precise with coordinates. End with done when finished. JSON array only.",
    messages = {{
      role = "user",
      content = {
        {
          type = "image",
          source = { type = "base64", media_type = "image/png", data = b64 }
        },
        { type = "text", text = "What actions should I take next? JSON array only." }
      }
    }}
  })

  http.asyncPost(
    "https://api.anthropic.com/v1/messages",
    function(error, response, data)
      if error then
        logger.e("API error: " .. error)
        callback(nil)
        return
      end
      local ok, decoded = pcall(json.decode, data)
      if not ok then
        callback(nil)
        return
      end
      if decoded and decoded.content and decoded.content[1] then
        local text = decoded.content[1].text
        -- Extract JSON array
        local start = text:find("%[")
        local finish = text:find("%]", start, true)
        if start and finish then
          local ok2, actions = pcall(json.decode, text:sub(start, finish))
          if ok2 then
            callback(actions)
            return
          end
        end
      end
      callback(nil)
    end,
    body,
    {
      ["x-api-key"] = api_key,
      ["anthropic-version"] = "2023-06-01",
      ["Content-Type"] = "application/json"
    }
  )
end

-- OpenAI vision API
local function call_openai(png_path, system_prompt, callback)
  local api_key = os.getenv("OPENAI_API_KEY")
  if not api_key then
    logger.e("OPENAI_API_KEY not set")
    callback(nil)
    return
  end

  local b64 = image_to_base64(png_path)
  if not b64 then
    callback(nil)
    return
  end

  local body = json.encode({
    model = "gpt-4o",
    messages = {
      { role = "system", content = system_prompt or
        "You see a screenshot of the Conductor Mac app. Return a JSON array of actions." },
      {
        role = "user",
        content = {
          { type = "image_url", image_url = { url = "data:image/png;base64," .. b64 } },
          { type = "text", text = "What actions next? JSON array only." }
        }
      }
    },
    max_tokens = 1024
  })

  http.asyncPost(
    "https://api.openai.com/v1/chat/completions",
    function(error, response, data)
      if error then
        logger.e("API error: " .. error)
        callback(nil)
        return
      end
      local ok, decoded = pcall(json.decode, data)
      if not ok then
        callback(nil)
        return
      end
      if decoded and decoded.choices and decoded.choices[1] then
        local text = decoded.choices[1].message.content
        local start = text:find("%[")
        local finish = text:find("%]", start, true)
        if start and finish then
          local ok2, actions = pcall(json.decode, text:sub(start, finish))
          if ok2 then
            callback(actions)
            return
          end
        end
      end
      callback(nil)
    end,
    body,
    {
      ["Authorization"] = "Bearer " .. api_key,
      ["Content-Type"] = "application/json"
    }
  )
end

-- Main process entry point
function M.process(png_path, callback)
  local cfg = load_config()
  local provider = (cfg.vision_api or {}).provider or "anthropic"
  local system_prompt = cfg.system_prompt

  logger.i("Sending screenshot to " .. provider)

  if provider == "anthropic" then
    call_anthropic(png_path, system_prompt, callback)
  elseif provider == "openai" then
    call_openai(png_path, system_prompt, callback)
  else
    logger.e("Unknown provider: " .. provider)
    callback(nil)
  end
end

return M
