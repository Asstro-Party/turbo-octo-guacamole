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
	move_and_slide()

func _handle_local_input(delta):
	# Movement
	var input_vector = Vector2.ZERO
	input_vector.x = Input.get_action_strength("move_right") - Input.get_action_strength("move_left")
	input_vector.y = Input.get_action_strength("move_down") - Input.get_action_strength("move_up")
	input_vector = input_vector.normalized()

	velocity = input_vector * speed

	# Rotation - rotate to face movement direction
	if input_vector.length() > 0:
		# Rotate to face the direction we're moving
		rotation = input_vector.angle()

	# Alternative: Use mouse for aiming (uncomment for mouse control)
	# var mouse_pos = get_global_mouse_position()
	# look_at(mouse_pos)

	# Send position update to server
	if network_manager and (velocity.length() > 0 or rotation != 0):
		network_manager.send_player_action("move", {
			"position": {"x": position.x, "y": position.y},
			"rotation": rotation,
			"velocity": {"x": velocity.x, "y": velocity.y}
		})

func _input(event):
	if not is_local_player:
		return

	# Shooting
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		shoot()

func shoot():
	if bullet_scene:
		var bullet = bullet_scene.instantiate()
		bullet.position = gun.global_position
		bullet.rotation = rotation
		bullet.shooter_id = player_id
		get_parent().add_child(bullet)

		player_shot.emit()

		# Send shoot action to server
		if network_manager:
			network_manager.send_player_action("shoot", {
				"position": {"x": gun.global_position.x, "y": gun.global_position.y},
				"rotation": rotation
			})

func apply_remote_action(action: String, data: Dictionary):
	# Apply actions from other players
	match action:
		"move":
			if data.has("position"):
				position = Vector2(data.position.x, data.position.y)
			if data.has("rotation"):
				rotation = data.rotation
			if data.has("velocity"):
				velocity = Vector2(data.velocity.x, data.velocity.y)

		"shoot":
			if bullet_scene and data.has("position"):
				var bullet = bullet_scene.instantiate()
				bullet.position = Vector2(data.position.x, data.position.y)
				bullet.rotation = data.rotation
				bullet.shooter_id = player_id
				get_parent().add_child(bullet)

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
