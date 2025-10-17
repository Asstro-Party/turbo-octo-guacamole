extends CharacterBody2D

# Player movement and shooting
@export var speed = 300.0
@export var rotation_speed = 10.0
@export var bullet_scene: PackedScene
@export var fire_rate := 0.30
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

	# Update shoot cooldown
	if _shoot_cooldown > 0.0:
		_shoot_cooldown -= delta

func _handle_local_input(delta):
	# Only allow forward movement with space bar
	var input_dict = {}
	var rotation_input = 0.0

	if Input.is_key_pressed(KEY_Q):
		rotation_input = 1.0

	input_dict["rotation"] = rotation_input

	if network_manager:
		network_manager.send_player_input(input_dict)

func _input(event):
	if not is_local_player:
		return
	# Handle shooting for spacebar or mouse
	if (event is InputEventKey and event.pressed and event.keycode == KEY_SPACE and not event.echo) or (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT):
		shoot()

func shoot():
	# Check cooldown
	if _shoot_cooldown > 0.0:
		return

	# Reset cooldown
	_shoot_cooldown = fire_rate

	# Send shoot input to server if connected
	if network_manager and network_manager.connected:
		network_manager.send_player_input({
			"shoot": {
				"position": {"x": gun.global_position.x, "y": gun.global_position.y},
				"rotation": rotation
			}
		})
		player_shot.emit()

func apply_remote_action(action: String, data: Dictionary):
	pass # No longer used; state is set by GameManager from server

func _get_random_spawn_position() -> Vector2:
	var viewport_size = get_viewport().get_visible_rect().size
	return Vector2(
		randf_range(100, viewport_size.x - 100),
		randf_range(100, viewport_size.y - 100)
	)

func _update_shooting(delta):
	if _shoot_cooldown > 0.0:
		_shoot_cooldown = max(_shoot_cooldown - delta, 0.0)

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
