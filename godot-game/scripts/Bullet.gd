extends Area2D

@export var speed = 600.0
@export var damage = 25
@export var lifetime = 2.0

var shooter_id = 0
var velocity = Vector2.ZERO

func _ready():
	velocity = Vector2(speed, 0).rotated(rotation)

	# Auto-destroy after lifetime
	await get_tree().create_timer(lifetime).timeout
	queue_free()

func _physics_process(delta):
	position += velocity * delta

func _on_body_entered(body):
	if body is TileMap or body is StaticBody2D:
		# Hit wall - destroy bullet
		queue_free()
