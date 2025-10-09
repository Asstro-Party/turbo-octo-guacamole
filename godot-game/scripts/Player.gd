extends CharacterBody2D

# Player movement and shooting
@export var speed = 300.0
@export var rotation_speed = 3.0
@export var bullet_scene: PackedScene

var player_id = 0
var is_local_player = false
var health = 100
var kills = 0
var deaths = 0
var network_manager = null

@onready var sprite = $Sprite2D if has_node("Sprite2D") else null
@onready var gun = $Gun if has_node("Gun") else null

signal player_died(killer_id)
signal player_shot()

func _ready():
	# Set player color based on ID
	modulate = _get_player_color(player_id)

func setup(p_player_id: int, p_is_local: bool, p_network_manager = null):
	player_id = p_player_id
	is_local_player = p_is_local
	network_manager = p_network_manager

	# Disable input for non-local players
	set_process_input(is_local_player)

func _physics_process(delta):
	if is_local_player:
		_handle_local_input(delta)
	# Do not move_and_slide() here; position is set by GameManager from server

func _handle_local_input(delta):
	# Movement input
	var input_vector = Vector2.ZERO
	input_vector.x = Input.get_action_strength("move_right") - Input.get_action_strength("move_left")
	input_vector.y = Input.get_action_strength("move_down") - Input.get_action_strength("move_up")
	input_vector = input_vector.normalized()

	var input_dict = {}
	input_dict["move"] = {"x": input_vector.x, "y": input_vector.y}
	input_dict["rotation"] = input_vector.angle() if input_vector.length() > 0 else rotation
	# Optionally, add shoot or other actions here

	if network_manager:
		network_manager.send_player_input(input_dict)
		# Debug: print sent input
		# print("Sent input: ", input_dict)

func _input(event):
	if not is_local_player:
		return

	# Shooting
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		shoot()

func shoot():
	# Only send shoot input to server; do not spawn bullet locally
	if network_manager:
		network_manager.send_player_input({
			"shoot": {
				"position": {"x": gun.global_position.x, "y": gun.global_position.y},
				"rotation": rotation
			}
		})
		player_shot.emit()

func apply_remote_action(action: String, data: Dictionary):
	pass # No longer used; state is set by GameManager from server

func take_damage(damage: int, attacker_id: int):
	health -= damage
	if health <= 0:
		die(attacker_id)

func die(killer_id: int):
	deaths += 1
	player_died.emit(killer_id)

	# Respawn
	health = 100
	position = _get_random_spawn_position()

func _get_random_spawn_position() -> Vector2:
	var viewport_size = get_viewport().get_visible_rect().size
	return Vector2(
		randf_range(100, viewport_size.x - 100),
		randf_range(100, viewport_size.y - 100)
	)

func _get_player_color(id: int) -> Color:
	var colors = [
		Color(1, 0.3, 0.3),  # Red
		Color(0.3, 0.3, 1),  # Blue
		Color(0.3, 1, 0.3),  # Green
		Color(1, 1, 0.3)     # Yellow
	]
	return colors[id % colors.size()]
