extends Node

# WebSocket connection to game server
var ws_url = "ws://localhost:3001"
var socket = WebSocketPeer.new()
var connected = false

signal player_joined(user_id, username)
signal game_started()
signal player_action_received(user_id, action, data)
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

		"player_joined":
			player_joined.emit(data.get("userId"), data.get("username"))

		"game_started":
			game_started.emit()

		"player_action":
			player_action_received.emit(
				data.get("userId"),
				data.get("action"),
				data.get("data")
			)

		"kill":
			kill_received.emit(data.get("killerId"), data.get("victimId"))

		"game_ended":
			game_ended.emit(data.get("results"))

func send_message(message: Dictionary):
	if connected:
		var json_str = JSON.stringify(message)
		socket.send_text(json_str)

func send_player_action(action: String, action_data: Dictionary):
	send_message({
		"type": "player_action",
		"userId": user_id,
		"action": action,
		"data": action_data
	})

func send_kill(victim_id: int, session_id: int):
	send_message({
		"type": "kill",
		"killerId": user_id,
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
