extends Node

# WebSocket connection to game server
var ws_url = "ws://localhost:3001"
var socket = WebSocketPeer.new()
var connected = false

# Store latest game state from server
var latest_game_state = {}

signal player_joined(user_id, username)
signal game_started()
signal game_state_received(state)
signal kill_received(killer_id, victim_id)
signal game_ended(results)
## Remove duplicate signal declarations if present
signal game_over_received(winner_id, results, host_user_id)
signal player_model_state_received(player_models)
signal player_model_selected(user_id, model, player_models)
signal player_left_lobby(user_id, model)
signal walls_received(walls)           # ADD THIS
signal portals_received(portals)       # ADD THIS
signal portals_removed()               # ADD THIS
signal wall_destroyed(wall_id)

var lobby_id = ""
var user_id = 0
var username = ""

func _ready():
	# Get lobby info from JavaScript (passed via query params or postMessage)
	if OS.has_feature("web"):
		var js_code = """
		window.godotConfig = window.godotConfig || {};
		window.godotConfig.lobbyId = new URLSearchParams(window.location.search).get('lobbyId') || '';
		window.godotConfig.userId = new URLSearchParams(window.location.search).get('userId') || '0';
		window.godotConfig.username = new URLSearchParams(window.location.search).get('username') || 'Player';
		window.godotConfig.playerModel = new URLSearchParams(window.location.search).get('playerModel') || '';
		"""
		JavaScriptBridge.eval(js_code)

func connect_to_server(p_lobby_id: String, p_user_id: int, p_username: String):
	lobby_id = p_lobby_id
	user_id = p_user_id
	username = p_username

	socket.connect_to_url(ws_url)

func _process(delta):
	socket.poll()
	var state = socket.get_ready_state()

	if state == WebSocketPeer.STATE_OPEN:
		if not connected:
			connected = true
			_on_connection_established()

		while socket.get_available_packet_count():
			var packet = socket.get_packet()
			var json_str = packet.get_string_from_utf8()
			var json = JSON.new()
			var parse_result = json.parse(json_str)
			if parse_result == OK:
				_handle_message(json.data)

	elif state == WebSocketPeer.STATE_CLOSED:
		if connected:
			connected = false
			print("WebSocket connection closed")

func _on_connection_established():
	print("[NetworkManager] Connected to game server - lobbyId:", lobby_id, " userId:", user_id, " username:", username)
	# Send join game message
	send_message({
		"type": "join_game",
		"lobbyId": lobby_id,
		"userId": user_id,
		"username": username
	})
	print("[NetworkManager] Sent join_game message")

func _handle_message(data: Dictionary):
	match data.get("type", ""):
		"joined":
			print("[NetworkManager] Successfully joined game")
						# Handle walls and portals from server
			if data.has("walls"):
				walls_received.emit(data["walls"])
			if data.has("portals") and data["portals"].size() > 0:
				portals_received.emit(data["portals"])
			if data.has("players"):
				for pid in data["players"]:
					if int(pid) != user_id:
						player_joined.emit(int(pid), "Player" + str(pid))
		
		"portals_spawned":
			print("[NetworkManager] Server spawned portals:", data.get("portals"))
			portals_received.emit(data.get("portals", []))
		
		"portals_removed":
			print("[NetworkManager] Server removed portals")
			portals_removed.emit()

		"wall_destroyed":  
			print("[NetworkManager] Server destroyed wall:", data.get("wallId"))
			wall_destroyed.emit(data.get("wallId"))
			
		"game_started":
			game_started.emit()
		"game_state":
			latest_game_state = data.get("state", {})
			# Removed per-tick logging for performance
			game_state_received.emit(latest_game_state)
		"kill":
			kill_received.emit(data.get("killerId"), data.get("victimId"))
		"game_ended":
			game_ended.emit(data.get("results"))
		"game_over":
			game_over_received.emit(data.get("winnerId"), data.get("results", []), data.get("hostUserId"))
		"player_model_state":
			player_model_state_received.emit(data.get("playerModels", {}))
		"player_model_selected":
			player_model_selected.emit(
				data.get("userId"),
				data.get("model"),
				data.get("playerModels", {})
			)
		"player_left":
			player_left_lobby.emit(
				data.get("userId"),
				data.get("model")
			)
		"play_sound":
			_handle_play_sound(data)
			

func _handle_play_sound(data: Dictionary):
	var sound_name: String = data.get("sound", "")
	if sound_name == "":
		print("[NetworkManager] Received play_sound with no sound name")
		return

	var pos_dict = data.get("position", null)
	var position = Vector2.ZERO
	if pos_dict:
		position = Vector2(
			pos_dict.get("x", 0.0),
			pos_dict.get("y", 0.0)
		)

	print("[NetworkManager] Playing sound:", sound_name, "at", position)
	AudioManager.play_sound(sound_name, position)


func send_message(message: Dictionary):
	if connected:
		var json_str = JSON.stringify(message)
		socket.send_text(json_str)

# Send player input (not state) to server
# Throttle movement, but send shoot and significant rotation immediately
var _last_input_send_time := 0.0
const INPUT_SEND_INTERVAL := 0.05 # 20Hz
var _last_sent_rotation: float = 0.0
const ROTATION_THRESHOLD := 0.01 # radians
func send_player_input(input: Dictionary):
	var now = Time.get_ticks_msec() / 1000.0
	var should_send := false

	# Always send if shooting
	if input.has("shoot"):
		should_send = true

	# Always send if rotation changed significantly
	if input.has("rotation"):
		if _last_sent_rotation == null or abs(input["rotation"] - _last_sent_rotation) > ROTATION_THRESHOLD:
			should_send = true
			_last_sent_rotation = input["rotation"]

	# Otherwise, throttle movement
	if not should_send and now - _last_input_send_time < INPUT_SEND_INTERVAL:
		return

	_last_input_send_time = now
	send_message({
		"type": "player_input",
		"userId": user_id,
		"input": input
	})

func send_kill(killer_id: int, victim_id: int, session_id: int):
	# Ensure caller provides both killer and victim IDs. user_id is still available
	# Debug: log outgoing kill payload
	print("[NetworkManager] Sending kill payload -> killer:", killer_id, "victim:", victim_id, "session:", session_id)
	send_message({
		"type": "kill",
		"killerId": killer_id,
		"victimId": victim_id,
		"sessionId": session_id
	})

func start_game():
	send_message({
		"type": "start_game",
		"lobbyId": lobby_id
	})

func end_game(results: Array):
	send_message({
		"type": "end_game",
		"lobbyId": lobby_id,
		"results": results
	})
