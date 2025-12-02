extends Node

# Manages the game state and players
@export var player_scene: PackedScene
@export var moving_wall_scene: PackedScene

var players = {}
var bullets = {}
var local_player_id = 0
var session_id = 0
var player_models = {}
var moving_walls = []
var powerup_manager = null

@onready var network_manager = $NetworkManager
@onready var players_container = $Players
@onready var health_bar = get_node_or_null("/root/Main/CanvasLayer/Control/HealthBar")
@onready var kills_label = get_node_or_null("/root/Main/CanvasLayer/Control/KillsLabel")
@onready var deaths_label = get_node_or_null("/root/Main/CanvasLayer/Control/DeathsLabel")
@onready var powerup_label = get_node_or_null("/root/Main/CanvasLayer/Control/PowerupLabel")
@onready var game_over_screen = get_node_or_null("/root/Main/CanvasLayer/Control/GameOverScreen")
@onready var winner_label = get_node_or_null("/root/Main/CanvasLayer/Control/GameOverScreen/Panel/VBoxContainer/WinnerLabel")
@onready var scores_list = get_node_or_null("/root/Main/CanvasLayer/Control/GameOverScreen/Panel/VBoxContainer/ScoresList")
@onready var return_button = get_node_or_null("/root/Main/CanvasLayer/Control/GameOverScreen/Panel/VBoxContainer/ReturnButton")
@onready var host_only_label = get_node_or_null("/root/Main/CanvasLayer/Control/GameOverScreen/Panel/VBoxContainer/HostOnlyLabel")

var is_host = false
var current_lobby_id = ""
var game_over = false  # Track if game has ended

func _ready():
	# Create PowerupManager
	var PowerupManagerScript = load("res://scripts/PowerupManager.gd")
	powerup_manager = Node.new()
	powerup_manager.set_script(PowerupManagerScript)
	powerup_manager.name = "PowerupManager"
	add_child(powerup_manager)
	
	# Connect to network manager signals
	network_manager.player_joined.connect(_on_player_joined)
	network_manager.game_started.connect(_on_game_started)
	network_manager.game_state_received.connect(_on_game_state_received)
	network_manager.kill_received.connect(_on_kill_received)
	network_manager.game_ended.connect(_on_game_ended)
	network_manager.game_over_received.connect(_on_game_over_received)
	network_manager.player_model_state_received.connect(_on_player_model_state_received)
	network_manager.player_model_selected.connect(_on_player_model_selected)
	network_manager.player_left_lobby.connect(_on_player_left_lobby)
	network_manager.walls_received.connect(_on_walls_received)           
	network_manager.wall_destroyed.connect(_on_wall_destroyed)
	
	# Connect powerup signals
	network_manager.powerup_spawned.connect(_on_powerup_spawned)
	network_manager.powerup_collected.connect(_on_powerup_collected)
	network_manager.laser_activated.connect(_on_laser_activated)
	network_manager.laser_deactivated.connect(_on_laser_deactivated)
	network_manager.plunger_used.connect(_on_plunger_used)
	network_manager.mine_placed.connect(_on_mine_placed)
	network_manager.mine_armed.connect(_on_mine_armed)
	network_manager.mine_triggered.connect(_on_mine_triggered)
	network_manager.mine_expired.connect(_on_mine_expired)

	# Connect return button
	if return_button:
		return_button.pressed.connect(_on_return_button_pressed)

	# Get game info from URL parameters (when embedded in web page)
	if OS.has_feature("web"):
		_setup_from_web_params()
	else:
		# For testing in Godot editor - spawn a local player
		print("Running in editor - spawning test player")
		local_player_id = 1
		spawn_player(1, "TestPlayer", true)


func _setup_from_web_params():
	# Retrieve values stored in window.godotConfig by NetworkManager's JS
	var lobby_id = ""
	var user_id = 0
	var username = ""
	var model_name = ""

	# Use JavaScript to read the config values from the global window object
	if OS.has_feature("web"):
		lobby_id = JavaScriptBridge.eval("window.godotConfig.lobbyId")
		# Ensure user_id is correctly converted to an integer
		user_id = int(JavaScriptBridge.eval("window.godotConfig.userId"))
		username = JavaScriptBridge.eval("window.godotConfig.username")
		model_name = JavaScriptBridge.eval("window.godotConfig.playerModel")

	# Fallback/Debug check
	if user_id == 0 or lobby_id == "":
		print("Error: Could not retrieve valid web parameters. Falling back to test.")
		user_id = randi() % 10000 + 1
		username = "Player" + str(user_id)
		lobby_id = "test-lobby"

	network_manager.connect_to_server(lobby_id, user_id, username)
	local_player_id = user_id
	if model_name != null and model_name != "":
		player_models[str(user_id)] = model_name
		print("Local player model set to: ", model_name)

func _on_player_died(killer_id: int, victim_id: int):
	# Send kill event to server only if this client is the killer
	if killer_id == local_player_id:
		network_manager.send_kill(killer_id, victim_id, session_id)

func spawn_player(player_id: int, username: String, is_local: bool):
	print("[GameManager] spawn_player called - ID:", player_id, " username:", username, " is_local:", is_local)
	
	if players.has(player_id):
		print("[GameManager] Player already exists:", player_id)
		return

	if not player_scene:
		print("Error: player_scene not set")
		return

	var player = player_scene.instantiate()
	var spawn_pos = _get_spawn_position(players.size())
	print("[GameManager] Spawn position calculated:", spawn_pos)
	
	player.setup(player_id, is_local, network_manager)
	player.name = "Player_" + str(player_id)
	player.position = spawn_pos
	print("[GameManager] Player position set to:", player.position)

	player.player_died.connect(_on_player_died)

	players_container.add_child(player)
	players[player_id] = player

	_apply_player_model(player_id)

	print("[GameManager] Spawned player successfully:", username, " at position:", player.position, " in scene tree:", player.is_inside_tree())

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
	game_over = false  # Reset game over flag
	# Reset all player stats
	for player in players.values():
		player.kills = 0
		player.deaths = 0
		player.health = 100


# Update all players from authoritative game state
func _on_game_state_received(state: Dictionary):
	# Don't update game state if game is over
	if game_over:
		return
	
	if not state.has("players"):
		return
	# Removed excessive debug logging for performance
	var server_player_ids = []
	for pid_str in state["players"].keys():
		var pid = int(pid_str)
		server_player_ids.append(pid)
		var pdata = state["players"][pid_str]
		if not players.has(pid):
			spawn_player(pid, pdata.get("username", "Player" + str(pid)), pid == local_player_id)
		var player = players[pid]
		player.position = Vector2(pdata["position"]["x"], pdata["position"]["y"])
		player.rotation = pdata["rotation"]
		player.health = pdata.get("health", 100)
		player.kills = pdata.get("kills", 0)
		player.deaths = pdata.get("deaths", 0)
		
		# Update powerup visual effect
		var powerup_data = pdata.get("powerup", null)
		_apply_powerup_visual_effect(player, powerup_data)

		# Update UI for local player
		if pid == local_player_id:
			_update_local_player_ui(player)

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
				# The node may have been freed (e.g. bullet timed out and called queue_free()).
				if not is_instance_valid(bullet):
					# Recreate bullet without logging for performance
					bullets.erase(bid)
					var bullet_scene = preload("res://scenes/bullet.tscn")
					var new_bullet = bullet_scene.instantiate()
					new_bullet.position = Vector2(bullet_data["position"]["x"], bullet_data["position"]["y"])
					new_bullet.rotation = bullet_data["rotation"]
					new_bullet.shooter_id = bullet_data["shooterId"]
					bullets[bid] = new_bullet
					players_container.add_child(new_bullet)
				else:
					bullet.position = Vector2(bullet_data["position"]["x"], bullet_data["position"]["y"])
					bullet.rotation = bullet_data["rotation"]
		# Remove bullets that no longer exist on server
		var to_remove = []
		for local_bid in bullets.keys():
			if not server_bullet_ids.has(local_bid):
				to_remove.append(local_bid)
		for remove_bid in to_remove:
			var node = bullets[remove_bid]
			if is_instance_valid(node):
				if node.get_parent():
					node.get_parent().remove_child(node)
				node.queue_free()
			bullets.erase(remove_bid)

	# Remove local player nodes that are not in the server state
	var to_remove = []
	for local_pid in players.keys():
		if not server_player_ids.has(local_pid):
			to_remove.append(local_pid)
	for remove_pid in to_remove:
		var node = players[remove_pid]
		if is_instance_valid(node):
			if node.get_parent():
				node.get_parent().remove_child(node)
			node.queue_free()
		players.erase(remove_pid)
	
	# --- Powerup sync ---
	if state.has("powerups") and powerup_manager:
		var server_powerups = state["powerups"]
		var server_powerup_ids = []
		
		for powerup_data in server_powerups:
			var powerup_id = powerup_data["id"]
			server_powerup_ids.append(powerup_id)
			
			# Check if powerup already exists
			if not powerup_manager.powerups.has(powerup_id):
				powerup_manager.spawn_powerup(powerup_data)
		
		# Remove powerups that no longer exist on server
		var powerups_to_remove = []
		for local_powerup_id in powerup_manager.powerups.keys():
			if not server_powerup_ids.has(local_powerup_id):
				powerups_to_remove.append(local_powerup_id)
		for remove_powerup_id in powerups_to_remove:
			powerup_manager.remove_powerup(remove_powerup_id)
	
	# --- Mine sync ---
	if state.has("mines") and powerup_manager:
		var server_mines = state["mines"]
		var server_mine_ids = []
		
		for mine_data in server_mines:
			var mine_id = mine_data["id"]
			server_mine_ids.append(mine_id)
			
			# Check if mine already exists
			if not powerup_manager.mines.has(mine_id):
				powerup_manager.place_mine(mine_data)
				# Update armed status if needed
				if mine_data.get("armed", false):
					powerup_manager.arm_mine(mine_id)
		
		# Remove mines that no longer exist on server
		var mines_to_remove = []
		for local_mine_id in powerup_manager.mines.keys():
			if not server_mine_ids.has(local_mine_id):
				mines_to_remove.append(local_mine_id)
		for remove_mine_id in mines_to_remove:
			powerup_manager.remove_mine(remove_mine_id)

func _on_kill_received(killer_id: int, victim_id: int):
	# Removed logging for performance
	# Death sound effect
	var victim = players[victim_id]
	AudioManager.play_sound("death", victim.global_position)
	network_manager.send_message({
		"type": "play_sound",
		"name": "death",
		"position": {"x": victim.global_position.x, "y": victim.global_position.y}
	})
	# Death particle effect
	var death_effect_scene = preload("res://scenes/effects/death_effect.tscn")
	var effect = death_effect_scene.instantiate()
	effect.global_position = victim.global_position
	players_container.add_child(effect)
	effect.emitting = true
	# Free the node after its lifetime
	effect.call_deferred("queue_free")
	
	if players.has(killer_id):
		players[killer_id].kills += 1

	if players.has(victim_id):
		players[victim_id].deaths += 1

func _on_game_ended(results: Array):
	print("Game ended! Results: ", results)
	# Show end game screen
	# Return to lobby after delay

func _on_game_over_received(winner_id: int, results: Array, host_user_id):
	print("Game over! Winner: ", winner_id, " Results: ", results, " Host: ", host_user_id)

	# Set game over flag to stop processing game state updates
	game_over = true

	# Set host flag - ensure type conversion
	var host_id = int(host_user_id) if host_user_id != null else 0
	is_host = (local_player_id == host_id)
	print("[GameManager] Comparing local_player_id: ", local_player_id, " (type: ", typeof(local_player_id), ") with host_id: ", host_id, " (type: ", typeof(host_id), ") -> is_host: ", is_host)

	# Disable all player inputs
	for player in players.values():
		if player.has_method("set_game_over"):
			player.set_game_over(true)

	# Show game over screen
	if game_over_screen:
		game_over_screen.visible = true

	# Find winner info
	var winner_name = "Unknown"
	for result in results:
		if result.get("userId") == winner_id:
			winner_name = result.get("username", "Player " + str(winner_id))
			break

	# Update winner label
	if winner_label:
		if winner_id == local_player_id:
			winner_label.text = "Y O U   W I N !"
		else:
			winner_label.text = (winner_name + "   W I N S !").to_upper()

	# Clear and populate scores list
	if scores_list:
		# Clear existing children
		for child in scores_list.get_children():
			child.queue_free()

		# Add scores
		var place_emoji = ["🥇", "🥈", "🥉", "4️⃣"]
		for i in range(results.size()):
			var result = results[i]
			var score_label = Label.new()
			var player_name = result.get("username", "Player " + str(result.get("userId")))
			var kills_count = result.get("kills", 0)
			var deaths_count = result.get("deaths", 0)
			var placement = result.get("placement", i + 1)
			var emoji = place_emoji[min(placement - 1, 3)]

			score_label.text = emoji + "  " + player_name.to_upper() + "  -  " + str(kills_count) + " K  /  " + str(deaths_count) + " D"
			score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

			# Style the label
			score_label.add_theme_font_size_override("font_size", 18)

			# Highlight winner with themed colors
			if placement == 1:
				# Gold/emerald for winner (matches the button)
				score_label.add_theme_color_override("font_color", Color(0.267, 0.878, 0.733, 1))
			elif placement == 2:
				# Light slate
				score_label.add_theme_color_override("font_color", Color(0.812, 0.812, 0.843, 0.9))
			elif placement == 3:
				# Slightly dimmer
				score_label.add_theme_color_override("font_color", Color(0.812, 0.812, 0.843, 0.75))
			else:
				score_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7, 1))

			scores_list.add_child(score_label)

	# Show/hide return button based on host status
	if return_button:
		return_button.visible = true
		if is_host:
			return_button.disabled = false
			return_button.text = "Return to Waiting Room"
		else:
			return_button.disabled = true
			return_button.text = "Waiting for host..."

	if host_only_label:
		host_only_label.visible = not is_host

func _on_return_button_pressed():
	if is_host:
		# Send message to server to return everyone to waiting room
		network_manager.send_message({
			"type": "host_return_to_waiting",
			"lobbyId": network_manager.lobby_id
		})

func _update_local_player_ui(player):
	if health_bar:
		health_bar.value = player.health
	if kills_label:
		kills_label.text = "Kills: " + str(player.kills)
	if deaths_label:
		deaths_label.text = "Deaths: " + str(player.deaths)
	
	# Update powerup display and visual effect
	if powerup_label:
		var powerup_data = player.get("powerup", {})
		if powerup_data and powerup_data.get("type"):
			var powerup_name = _get_powerup_display_name(powerup_data.type)
			var charges = powerup_data.get("charges", 1)
			if charges > 1:
				powerup_label.text = "Powerup: " + powerup_name + " (" + str(charges) + ")"
			else:
				powerup_label.text = "Powerup: " + powerup_name + " [E]"
			powerup_label.visible = true
		else:
			powerup_label.text = "No Powerup"
			powerup_label.visible = false

func _get_powerup_display_name(type: String) -> String:
	match type:
		"DIARRHEA_LASER":
			return "💩 Diarrhea Laser"
		"PLUNGER_MELEE":
			return "🪠 Plunger"
		"DIAPER_MINES":
			return "💣 Diaper Mines"
		_:
			return type

func _apply_powerup_visual_effect(player, powerup_data):
	if not player or not is_instance_valid(player):
		return
	
	# Handle null or non-dictionary powerup_data
	if powerup_data == null or typeof(powerup_data) != TYPE_DICTIONARY:
		player.modulate = Color(1, 1, 1, 1)
		return
	
	var powerup_type = powerup_data.get("type", "")
	
	if powerup_type == null or powerup_type == "":
		# No powerup - reset to default white
		player.modulate = Color(1, 1, 1, 1)
	else:
		# Apply color based on powerup type
		match powerup_type:
			"DIARRHEA_LASER":
				# Green tint for laser
				player.modulate = Color(0.5, 1.0, 0.5, 1)
			"DIAPER_MINES":
				# Red tint for mines
				player.modulate = Color(1.0, 0.5, 0.5, 1)
			"PLUNGER_MELEE":
				# Yellow tint for melee
				player.modulate = Color(1.0, 1.0, 0.5, 1)
			_:
				# Unknown powerup - reset to white
				player.modulate = Color(1, 1, 1, 1)

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


func spawn_moving_walls():
	var viewport_size = get_viewport().get_visible_rect().size
	var wall_positions = [
		Vector2(400, viewport_size.y / 2),
		Vector2(viewport_size.x / 2, 300),
		Vector2(viewport_size.x - 400, viewport_size.y / 2)
	]
	
	for i in range(3):
		if not moving_wall_scene:
			print("Error: moving_wall_scene not set")
			return
			
		var wall = moving_wall_scene.instantiate()
		wall.position = wall_positions[i]
		wall.is_horizontal = (i % 2 == 0)
		players_container.add_child(wall)
		moving_walls.append(wall)


func clear_walls():
	for wall in moving_walls:
		if is_instance_valid(wall):
			wall.queue_free()
	moving_walls.clear()
	print("[GameManager] Cleared all walls")

func _on_walls_received(walls_data: Array):
	print("[GameManager] Received walls from server:", walls_data)
	sync_walls_from_server(walls_data)

func sync_walls_from_server(walls_data: Array):
	clear_walls()
	
	for wall_data in walls_data:
		if not moving_wall_scene:
			print("Error: moving_wall_scene not set")
			return
		
		var wall = moving_wall_scene.instantiate()
		wall.position = Vector2(wall_data.position.x, wall_data.position.y)
		wall.is_horizontal = wall_data.isHorizontal
		wall.health = wall_data.health
		wall.id = wall_data.id
		
		# Add to scene first so the wall's _ready() can run and update collision shape
		players_container.add_child(wall)
		
		# Rotate only the sprite for horizontal walls, not the whole body
		if wall_data.isHorizontal:
			var sprite = wall.get_node("Sprite2D")
			if sprite:
				sprite.rotation_degrees = 90
		
		moving_walls.append(wall)
	
	print("[GameManager] Spawned", moving_walls.size(), "walls from server")

func _on_wall_destroyed(wall_id: int):
	print("[GameManager] Removing destroyed wall:", wall_id)
	
	# Find and remove the wall from the scene
	for i in range(moving_walls.size() - 1, -1, -1):
		var wall = moving_walls[i]
		if wall and wall.id == wall_id:
			print("[GameManager] Found wall", wall_id, "in scene, removing it")
			wall.queue_free()
			moving_walls.remove_at(i)
			return
	
	print("[GameManager] Warning: Wall", wall_id, "not found in scene")

# Powerup handlers
func _on_powerup_spawned(powerup_data):
	print("[GameManager] Powerup spawned: ", powerup_data)
	if powerup_manager:
		print("[GameManager] powerup_manager exists, calling spawn_powerup")
		powerup_manager.spawn_powerup(powerup_data)
	else:
		print("[GameManager] ERROR: powerup_manager is NULL!")

func _on_powerup_collected(user_id, powerup_id):
	print("[GameManager] Powerup collected by user ", user_id)
	if powerup_manager:
		powerup_manager.remove_powerup(powerup_id)

func _on_laser_activated(user_id, position, rotation, duration):
	print("[GameManager] Laser activated by user ", user_id)
	if powerup_manager:
		powerup_manager.activate_laser(user_id, position, rotation, duration)

func _on_laser_deactivated(user_id):
	print("[GameManager] Laser deactivated for user ", user_id)
	if powerup_manager:
		powerup_manager.deactivate_laser(user_id)

func _on_plunger_used(user_id, position, rotation):
	print("[GameManager] Plunger used by user ", user_id)
	if powerup_manager:
		powerup_manager.show_plunger_effect(user_id, position, rotation)

func _on_mine_placed(mine_data):
	print("[GameManager] Mine placed: ", mine_data)
	if powerup_manager:
		powerup_manager.place_mine(mine_data)

func _on_mine_armed(mine_id):
	print("[GameManager] Mine armed: ", mine_id)
	if powerup_manager:
		powerup_manager.arm_mine(mine_id)

func _on_mine_triggered(mine_id, position, victim_id):
	print("[GameManager] Mine triggered: ", mine_id)
	if powerup_manager:
		powerup_manager.trigger_mine(mine_id, position)

func _on_mine_expired(mine_id):
	print("[GameManager] Mine expired: ", mine_id)
	if powerup_manager:
		powerup_manager.remove_mine(mine_id)