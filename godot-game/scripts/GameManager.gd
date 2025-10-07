extends Node

# Manages the game state and players
@export var player_scene: PackedScene

var players = {}
var local_player_id = 0
var session_id = 0

@onready var network_manager = $NetworkManager
@onready var players_container = $Players

func _ready():
	# Connect to network manager signals
	network_manager.player_joined.connect(_on_player_joined)
	network_manager.game_started.connect(_on_game_started)
	network_manager.player_action_received.connect(_on_player_action_received)
	network_manager.kill_received.connect(_on_kill_received)
	network_manager.game_ended.connect(_on_game_ended)

	# Get game info from URL parameters (when embedded in web page)
	if OS.has_feature("web"):
		_setup_from_web_params()
	else:
		# For testing in Godot editor - spawn a local player
		print("Running in editor - spawning test player")
		local_player_id = 1
		spawn_player(1, "TestPlayer", true)

func _setup_from_web_params():
	# This would be called with actual parameters from the web page
	# For now, using placeholder values
	var lobby_id = "test-lobby"
	var user_id = 1
	var username = "Player1"

	network_manager.connect_to_server(lobby_id, user_id, username)
	local_player_id = user_id

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
