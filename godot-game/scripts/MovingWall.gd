extends StaticBody2D

@export var health = 100
@export var move_speed = 100.0
@export var move_range = 300.0  # How far it moves

var id = -1 
var start_position: Vector2
var direction = 1  # 1 or -1
var is_horizontal = true  # true for horizontal, false for vertical

func _ready():
	start_position = position

func update_collision_shape():
	var collision_shape = get_node("CollisionShape2D")
	if collision_shape and collision_shape.shape:
		if is_horizontal:
			# For horizontal doors, swap width and height
			collision_shape.shape.size = Vector2(100, 40)
		else:
			# For vertical doors, keep original
			collision_shape.shape.size = Vector2(40, 100)

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