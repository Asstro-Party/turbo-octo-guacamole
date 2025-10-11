extends CharacterBody2D

# Player movement and shooting
@export var speed = 300.0
@export var rotation_speed = 10.0
@export var bullet_scene: PackedScene
@export var fire_rate := 0.15
@export var player_color: Color = Color.WHITE
@export var player_model: String = ""

const PLAYER_TEXTURE_DIR := "res://assets/players/"

var player_id = 0
var is_local_player = false
var health = 100
var kills = 0
var deaths = 0
var network_manager = null
var _shoot_cooldown := 0.0
var _default_texture: Texture2D = null

@onready var sprite = $Sprite2D if has_node("Sprite2D") else null
@onready var gun = $Gun if has_node("Gun") else null

signal player_died(killer_id)
signal player_shot()

func _ready():
	# Set player color based on ID
	modulate = player_color
	if sprite:
		_default_texture = sprite.texture
	if player_model != "":
		_apply_player_model(player_model)

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
	var wrapped = _wrap_position()
	if is_local_player:
		_update_shooting(delta)
		if wrapped and network_manager:
			network_manager.send_player_action("move", {
				"position": {"x": position.x, "y": position.y},
				"rotation": rotation,
				"velocity": {"x": velocity.x, "y": velocity.y}
			})

func _handle_local_input(delta):
	# Movement
	var input_vector = Vector2.ZERO
	input_vector.x = Input.get_action_strength("move_right") - Input.get_action_strength("move_left")
	input_vector.y = Input.get_action_strength("move_down") - Input.get_action_strength("move_up")
	input_vector = input_vector.normalized()

	velocity = input_vector * speed

	# Rotation - rotate to face movement direction
	var previous_rotation = rotation
	if input_vector.length() > 0:
		var target_rotation = input_vector.angle()
		var angle_diff = wrapf(target_rotation - rotation, -PI, PI)
		var max_step = rotation_speed * delta
		if abs(angle_diff) <= max_step:
			rotation = target_rotation
		else:
			rotation += clamp(angle_diff, -max_step, max_step)

	# Alternative: Use mouse for aiming (uncomment for mouse control)
	# var mouse_pos = get_global_mouse_position()
	# look_at(mouse_pos)

	# Send position update to server
	if network_manager and (velocity.length() > 0 or not is_equal_approx(previous_rotation, rotation)):
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
	_shoot_cooldown = fire_rate

	if bullet_scene:
		var muzzle_position = global_position
		if gun:
			muzzle_position = gun.global_position
		var bullet = bullet_scene.instantiate()
		bullet.position = muzzle_position
		bullet.rotation = rotation
		bullet.shooter_id = player_id
		get_parent().add_child(bullet)

		player_shot.emit()

		# Send shoot action to server
		if network_manager:
			network_manager.send_player_action("shoot", {
				"position": {"x": muzzle_position.x, "y": muzzle_position.y},
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

func _update_shooting(delta):
	if _shoot_cooldown > 0.0:
		_shoot_cooldown = max(_shoot_cooldown - delta, 0.0)
	if Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) and _shoot_cooldown <= 0.0:
		shoot()

func _wrap_position() -> bool:
	var viewport := get_viewport()
	if viewport == null:
		return false

	var rect := viewport.get_visible_rect()
	var min_x := rect.position.x
	var max_x := rect.position.x + rect.size.x
	var min_y := rect.position.y
	var max_y := rect.position.y + rect.size.y

	var new_x := wrapf(position.x, min_x, max_x)
	var new_y := wrapf(position.y, min_y, max_y)

	if !is_equal_approx(new_x, position.x) or !is_equal_approx(new_y, position.y):
		position = Vector2(new_x, new_y)
		return true

	return false

func set_player_model(model_name: String):
	player_model = model_name
	_apply_player_model(model_name)

func _apply_player_model(model_name: String):
	if sprite == null:
		return

	if model_name == null or model_name == "":
		if _default_texture:
			sprite.texture = _default_texture
		return

	var path = PLAYER_TEXTURE_DIR + model_name
	if ResourceLoader.exists(path):
		var texture = load(path)
		if texture:
			sprite.texture = texture
			return

	if _default_texture:
		sprite.texture = _default_texture
