-- night_owl: init.lua
-- Hammerspoon entry point — the supervisor that moonlights for you

local logger = hs.logger.new("night_owl", "info")

local config_dir = hs.settings.get("night_owl_config_dir")
  or os.getenv("HOME") .. "/conductor/workspaces/web10/beijing/night_owl"

local function load_config()
  local path = config_dir .. "/config.json"
  local ok, data = pcall(hs.json.decode, hs.fscontents.readfile(path))
  if not ok then
    hs.alert.show("night_owl: failed to load config.json")
    return nil
  end
  return data
end

-- Find the Conductor window
local function find_conductor_window()
  local app = hs.application.get("Conductor")
  if not app then
    logger.w("Conductor not running, launching...")
    hs.application.open("Conductor")
    hs.timer.doAfter(5, function() end)
    return nil
  end
  local windows = app:windows()
  return #windows > 0 and windows[1] or nil
end

-- Screenshot the Conductor window
local function screenshot_conductor()
  local win = find_conductor_window()
  if not win then return nil end

  local frame = win:frame()
  local img = hs.screen.mainScreen():captureFrame(frame)
  if not img then return nil end

  local path = os.tmpname()
  img:save(path .. ".png", "png")
  return path .. ".png"
end

-- Execute a single action
local function execute_action(action, callback)
  logger.i("Action: " .. hs.inspect(action))

  if action.type == "click" then
    hs.eventtap.mouseClick({}, action.x, action.y)
    hs.timer.doAfter(0.5, callback)

  elseif action.type == "type" then
    hs.eventtap.keyStrokes(action.text)
    hs.timer.doAfter(0.3, callback)

  elseif action.type == "press" then
    hs.eventtap.event.newKeyEvent(action.modifiers or {}, action.key, true):post()
    hs.eventtap.event.newKeyEvent(action.modifiers or {}, action.key, false):post()
    hs.timer.doAfter(0.5, callback)

  elseif action.type == "wait" then
    hs.timer.doAfter(action.seconds or 1, callback)

  elseif action.type == "text" then
    local texter = dofile(config_dir .. "/texter.lua")
    texter.send(action.event, action.message)
    hs.timer.doAfter(0.5, callback)

  elseif action.type == "done" then
    logger.i("AI done, cycle complete")
    callback()

  else
    logger.w("Unknown action type: " .. action.type)
    callback()
  end
end

-- Main supervisor cycle
local function supervisor_cycle()
  logger.i("=== Supervisor cycle starting ===")

  local png = screenshot_conductor()
  if not png then
    logger.e("No screenshot, skipping")
    return
  end

  local agent = dofile(config_dir .. "/conductor_agent.lua")
  agent.process(png, function(actions)
    os.remove(png)
    if not actions or #actions == 0 then
      logger.e("AI returned no actions")
      return
    end

    -- Execute actions sequentially
    local i = 1
    local function next()
      if i > #actions then
        logger.i("=== Cycle complete ===")
        return
      end
      execute_action(actions[i], function()
        i = i + 1
        hs.timer.doAfter(0.5, next)
      end)
    end
    next()
  end)
end

-- Scheduler
local owl_timer = nil

local function start_scheduler()
  local cfg = load_config()
  if not cfg or not cfg.schedule or not cfg.schedule.enabled then
    logger.i("Scheduler disabled in config")
    return
  end

  local interval = cfg.schedule.interval_minutes * 60
  logger.i("Scheduler started: every " .. cfg.schedule.interval_minutes .. "min")

  owl_timer = hs.timer.doEvery(interval, supervisor_cycle)
  hs.alert.show("night_owl: scheduler ON (" .. cfg.schedule.interval_minutes .. "min)")
end

local function stop_scheduler()
  if owl_timer then
    owl_timer:stop()
    owl_timer = nil
    hs.alert.show("night_owl: scheduler OFF")
  end
end

local scheduler_on = false

-- Hotkeys
hs.hotkey.bind({"cmd", "alt", "ctrl"}, "C", function()
  hs.alert.show("night_owl: manual trigger")
  supervisor_cycle()
end)

hs.hotkey.bind({"cmd", "alt", "ctrl"}, "S", function()
  scheduler_on = not scheduler_on
  if scheduler_on then
    start_scheduler()
  else
    stop_scheduler()
  end
end)

-- Boot
logger.i("night_owl loaded from " .. config_dir)
start_scheduler()
