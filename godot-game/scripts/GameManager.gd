extends Node

# Manages the game state and players
@export var player_scene: PackedScene

var players = {}
var local_player_id = 0
var session_id = 0
var player_models: Dictionary = {}

@onready var network_manager = $NetworkManager
@onready var players_container = $Players

func _ready():
	# Connect to network manager signals
	network_manager.player_joined.connect(_on_player_joined)
	network_manager.game_started.connect(_on_game_started)
	network_manager.player_action_received.connect(_on_player_action_received)
	network_manager.kill_received.connect(_on_kill_received)
	network_manager.game_ended.connect(_on_game_ended)
	network_manager.player_model_state_received.connect(_on_player_model_state_received)
	network_manager.player_model_selected.connect(_on_player_model_selected)
	network_manager.player_left_lobby.connect(_on_player_left_lobby)

	# Get game info from URL parameters (when embedded in web page)
	if OS.has_feature("web"):
		_setup_from_web_params()
	else:
		# For testing in Godot editor - spawn a local player
		print("Running in editor - spawning test player")
		local_player_id = 1
		spawn_player(1, "TestPlayer", true)

func _setup_from_web_params():
	var lobby_id = ""
	var user_id = 0
	var username = "Player"
	var model_name = ""

	if JavaScriptBridge:
		lobby_id = str(JavaScriptBridge.eval("window.godotConfig?.lobbyId || ''"))
		user_id = int(JavaScriptBridge.eval("window.godotConfig?.userId || '0'"))
		username = str(JavaScriptBridge.eval("window.godotConfig?.username || 'Player'"))
		model_name = str(JavaScriptBridge.eval("window.godotConfig?.playerModel || ''"))

	var invalid_tokens = ["null", "undefined"]
	if invalid_tokens.has(lobby_id):
		lobby_id = ""
	if invalid_tokens.has(username):
		username = "Player"
	if invalid_tokens.has(model_name):
		model_name = ""

	if lobby_id.is_empty() or user_id == 0:
		print("Missing lobby or user info from web parameters. Spawning local test player.")
		local_player_id = 1
		spawn_player(local_player_id, "WebTest", true)
		return

	network_manager.connect_to_server(lobby_id, user_id, username)
	local_player_id = user_id
	if model_name != "":
		player_models[str(user_id)] = model_name

	# Spawn local player
	spawn_player(user_id, username, true)

func spawn_player(player_id: int, username: String, is_local: bool):
	if players.has(player_id):
		return

	if not player_scene:
		print("Error: player_scene not set")
		return

	var player = player_scene.instantiate()
	player.setup(player_id, is_local, network_manager)
	player.name = "Player_" + str(player_id)
	player.position = _get_spawn_position(players.size())

	# Connect signals
	player.player_died.connect(_on_player_died.bind(player_id))

	players_container.add_child(player)
	players[player_id] = player

	_apply_player_model(player_id)

	print("Spawned player: ", username, " (", player_id, ")")

func _get_spawn_position(index: int) -> Vector2:
	var viewport_size = get_viewport().get_visible_rect().size
	var spawn_positions = [
		Vector2(200, 200),
		Vector2(viewport_size.x - 200, 200),
		Vector2(200, viewport_size.y - 200),
		Vector2(viewport_size.x - 200, viewport_size.y - 200)
	]
	return spawn_positions[index % spawn_positions.size()]

func _on_player_joined(user_id: int, username: String):
	print("Player joined: ", username)
	spawn_player(user_id, username, false)

func _on_game_started():
	print("Game started!")
	# Reset all player stats
	for player in players.values():
		player.kills = 0
		player.deaths = 0
		player.health = 100

func _on_player_action_received(user_id: int, action: String, data: Dictionary):
	if players.has(user_id) and user_id != local_player_id:
		players[user_id].apply_remote_action(action, data)

func _on_kill_received(killer_id: int, victim_id: int):
	print("Kill: ", killer_id, " killed ", victim_id)

	if players.has(killer_id):
		players[killer_id].kills += 1

	if players.has(victim_id):
		players[victim_id].deaths += 1

func _on_player_died(killer_id: int, victim_id: int):
	# Send kill event to server (only from local player)
	if victim_id == local_player_id:
		network_manager.send_kill(victim_id, session_id)

func _on_game_ended(results: Array):
	print("Game ended! Results: ", results)
	# Show end game screen
	# Return to lobby after delay

func _on_player_model_state_received(models: Dictionary):
	player_models = models.duplicate(true)
	for player_id in players.keys():
		_apply_player_model(player_id)

func _on_player_model_selected(user_id: int, model: String, models: Dictionary):
	if models:
		player_models = models.duplicate(true)
	else:
		player_models[str(user_id)] = model
	_apply_player_model(user_id)

func _on_player_left_lobby(user_id: int, model: String):
	player_models.erase(str(user_id))
	if players.has(user_id):
		_apply_player_model(user_id)

func _apply_player_model(player_id: int):
	if not players.has(player_id):
		return

	var key = str(player_id)
	var model_name = player_models.get(key, "")
	if model_name == null:
		model_name = ""

	players[player_id].set_player_model(model_name)
