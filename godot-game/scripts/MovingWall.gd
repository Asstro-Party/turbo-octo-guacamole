extends StaticBody2D

@export var health = 100
@export var move_speed = 100.0
@export var move_range = 300.0  # How far it moves

var id = -1 
var start_position: Vector2
var direction = 1  # 1 or -1
var _is_horizontal = true  # Private variable

# Use a setter so we can update collision when is_horizontal changes
var is_horizontal:
	get:
		return _is_horizontal
	set(value):
		_is_horizontal = value
		print("[MovingWall] is_horizontal set to: ", value, " for wall id: ", id)
		update_collision_shape()

func _ready():
	start_position = position
	print("[MovingWall] _ready() called for wall id: ", id, " is_horizontal: ", is_horizontal)

func update_collision_shape():
	var collision_shape = get_node_or_null("CollisionShape2D")
	if collision_shape and collision_shape.shape:
		if _is_horizontal:
			# For horizontal doors, swap width and height
			print("[MovingWall] Setting collision to HORIZONTAL (100x40) for wall id: ", id)
			collision_shape.shape.size = Vector2(100, 40)
		else:
			# For vertical doors, keep original
			print("[MovingWall] Setting collision to VERTICAL (40x100) for wall id: ", id)
			collision_shape.shape.size = Vector2(40, 100)
		print("[MovingWall] Collision shape size is now: ", collision_shape.shape.size)
	else:
		print("[MovingWall] ERROR: Could not find CollisionShape2D for wall id: ", id)

func take_damage(amount: int, attacker_id: int):
	health -= amount
	# Visual feedback - flash or shake
	modulate = Color(1, 0.5, 0.5)  # Red tint
	await get_tree().create_timer(0.1).timeout
	modulate = Color(1, 1, 1)
	
	if health <= 0:
		destroy_wall()

func destroy_wall():
	# Play destruction animation/sound
	queue_free()