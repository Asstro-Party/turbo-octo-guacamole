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
	if body.has_method("take_damage"):
		# Don't damage the shooter
		if body.player_id != shooter_id:
			print("[Bullet] Hit detected on body", body.name, "by shooter", shooter_id, "damage", damage)
			body.take_damage(damage, shooter_id)
			queue_free()
	elif body.has_method("take_damage"):  # ADD THIS - for walls
		body.take_damage(damage, shooter_id)
		queue_free()
	elif body is TileMap or body is StaticBody2D:
		# Hit wall
		queue_free()
