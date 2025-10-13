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
	print("Connected to game server")
	# Send join game message
	send_message({
		"type": "join_game",
		"lobbyId": lobby_id,
		"userId": user_id,
		"username": username
	})

func _handle_message(data: Dictionary):
		match data.get("type", ""):
			"joined":
				print("Successfully joined game")
				if data.has("players"):
					for pid in data["players"]:
						if int(pid) != user_id:
							player_joined.emit(int(pid), "Player" + str(pid))
			"player_joined":
				player_joined.emit(data.get("userId"), data.get("username"))
			"game_started":
				game_started.emit()
			"game_state":
				latest_game_state = data.get("state", {})
				game_state_received.emit(latest_game_state)
			"kill":
				kill_received.emit(data.get("killerId"), data.get("victimId"))
			"game_ended":
				game_ended.emit(data.get("results"))

func send_message(message: Dictionary):
	if connected:
		var json_str = JSON.stringify(message)
		socket.send_text(json_str)


# Send player input (not state) to server
func send_player_input(input: Dictionary):
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
