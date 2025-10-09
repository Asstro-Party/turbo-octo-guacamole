extends Node

# Manages the game state and players
@export var player_scene: PackedScene


var players = {}
var bullets = {}
var local_player_id = 0
var session_id = 0


@onready var network_manager = $NetworkManager
@onready var players_container = $Players

func _ready():
	# Connect to network manager signals
	network_manager.player_joined.connect(_on_player_joined)
	network_manager.game_started.connect(_on_game_started)
	network_manager.game_state_received.connect(_on_game_state_received)
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
	# For now, using randomized values for local/editor testing
	var lobby_id = "test-lobby"
	var user_id = randi() % 10000 + 1
	var username = "Player" + str(user_id)

	network_manager.connect_to_server(lobby_id, user_id, username)
	local_player_id = user_id

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


# Update all players from authoritative game state
func _on_game_state_received(state: Dictionary):
	if not state.has("players"):
		return
	print("[DEBUG] Server state for all players:")
	var server_player_ids = []
	for pid_str in state["players"].keys():
		var pid = int(pid_str)
		server_player_ids.append(pid)
		var pdata = state["players"][pid_str]
		print("  Player ", pid, ": pos=", pdata["position"], ", rot=", pdata["rotation"])
		if not players.has(pid):
			spawn_player(pid, pdata.get("username", "Player" + str(pid)), pid == local_player_id)
		var player = players[pid]
		player.position = Vector2(pdata["position"]["x"], pdata["position"]["y"])
		player.rotation = pdata["rotation"]
		player.health = pdata.get("health", 100)
		player.kills = pdata.get("kills", 0)
		player.deaths = pdata.get("deaths", 0)

	# --- Bullet sync ---
	if state.has("bullets"):
		var server_bullets = state["bullets"]
		var server_bullet_ids = []
		for bullet_data in server_bullets:
			var bid = bullet_data["id"]
			server_bullet_ids.append(bid)
			if not bullets.has(bid):
				var bullet_scene = preload("res://scenes/bullet.tscn")
				var bullet = bullet_scene.instantiate()
				bullet.position = Vector2(bullet_data["position"]["x"], bullet_data["position"]["y"])
				bullet.rotation = bullet_data["rotation"]
				bullet.shooter_id = bullet_data["shooterId"]
				bullets[bid] = bullet
				players_container.add_child(bullet)
			else:
				var bullet = bullets[bid]
				bullet.position = Vector2(bullet_data["position"]["x"], bullet_data["position"]["y"])
				bullet.rotation = bullet_data["rotation"]
		# Remove bullets that no longer exist on server
		var to_remove = []
		for local_bid in bullets.keys():
			if not server_bullet_ids.has(local_bid):
				to_remove.append(local_bid)
		for remove_bid in to_remove:
			var node = bullets[remove_bid]
			if node and node.get_parent():
				node.get_parent().remove_child(node)
			bullets.erase(remove_bid)

	# Remove local player nodes that are not in the server state
	var to_remove = []
	for local_pid in players.keys():
		if not server_player_ids.has(local_pid):
			to_remove.append(local_pid)
	for remove_pid in to_remove:
		var node = players[remove_pid]
		if node and node.get_parent():
			node.get_parent().remove_child(node)
		players.erase(remove_pid)

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
