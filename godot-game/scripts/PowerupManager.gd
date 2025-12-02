extends Node

var powerups = {}
var mines = {}
var laser_effects = {}
var players_container = null

signal powerup_collected(powerup_id)

func _ready():
	players_container = get_node_or_null("/root/Main/GameManager/Players")

func spawn_powerup(powerup_data):
	if powerups.has(powerup_data.id):
		return
	
	# Create an Area2D for collision detection
	var powerup = Area2D.new()
	powerup.position = Vector2(powerup_data.position.x, powerup_data.position.y)
	powerup.name = "Powerup_" + powerup_data.id
	powerup.collision_layer = 8  # Powerup layer
	powerup.collision_mask = 1   # Can detect players
	
	# Create visual sprite
	var sprite = Sprite2D.new()
	var texture = ImageTexture.new()
	var image = Image.create(32, 32, false, Image.FORMAT_RGBA8)
	image.fill(Color(1, 0.8, 0, 1))  # Yellow/gold color
	texture.set_image(image)
	sprite.texture = texture
	sprite.scale = Vector2(1.5, 1.5)
	powerup.add_child(sprite)
	
	# Add collision shape for pickup detection
	var collision = CollisionShape2D.new()
	var shape = CircleShape2D.new()
	shape.radius = 30  # Pickup radius
	collision.shape = shape
	powerup.add_child(collision)
	
	# Add pulsing animation
	var tween = create_tween()
	tween.set_loops()
	tween.tween_property(sprite, "scale", Vector2(1.8, 1.8), 0.5)
	tween.tween_property(sprite, "scale", Vector2(1.5, 1.5), 0.5)
	
	# Add metadata
	powerup.set_meta("powerup_id", powerup_data.id)
	powerup.set_meta("powerup_type", powerup_data.type)
	
	# Connect body entered signal for automatic pickup
	powerup.body_entered.connect(_on_powerup_body_entered.bind(powerup_data.id))
	
	powerups[powerup_data.id] = powerup
	
	if players_container:
		players_container.add_child(powerup)
		print("[PowerupManager] Spawned ", powerup_data.type, " at ", powerup.position)

func remove_powerup(powerup_id):
	if powerups.has(powerup_id):
		powerups[powerup_id].queue_free()
		powerups.erase(powerup_id)
		print("[PowerupManager] Removed powerup ", powerup_id)

func place_mine(mine_data):
	if mines.has(mine_data.id):
		return
	
	# Create visual representation of mine
	var mine = Sprite2D.new()
	mine.position = Vector2(mine_data.position.x, mine_data.position.y)
	mine.name = "Mine_" + mine_data.id
	
	# Set texture (you can replace with actual diaper mine asset)
	var texture = ImageTexture.new()
	var image = Image.create(24, 24, false, Image.FORMAT_RGBA8)
	image.fill(Color(0.6, 0.4, 0.2, 0.8))  # Brown color for diaper
	texture.set_image(image)
	mine.texture = texture
	mine.modulate = Color(1, 1, 1, 0.5)  # Semi-transparent when not armed
	
	mine.set_meta("mine_id", mine_data.id)
	mine.set_meta("armed", false)
	
	mines[mine_data.id] = mine
	
	if players_container:
		players_container.add_child(mine)
		print("[PowerupManager] Placed mine at ", mine.position)

func arm_mine(mine_id):
	if mines.has(mine_id):
		var mine = mines[mine_id]
		mine.modulate = Color(1, 0, 0, 1)  # Red when armed
		mine.set_meta("armed", true)
		print("[PowerupManager] Mine armed: ", mine_id)

func trigger_mine(mine_id, position):
	if mines.has(mine_id):
		# Play explosion effect
		if players_container:
			var explosion = create_explosion_effect(Vector2(position.x, position.y))
			players_container.add_child(explosion)
		
		# Remove mine
		mines[mine_id].queue_free()
		mines.erase(mine_id)
		print("[PowerupManager] Mine triggered: ", mine_id)

func remove_mine(mine_id):
	if mines.has(mine_id):
		mines[mine_id].queue_free()
		mines.erase(mine_id)

func activate_laser(user_id, position, rotation, duration):
	# Create laser beam visual
	var laser = Line2D.new()
	laser.name = "Laser_" + str(user_id)
	laser.width = 8.0
	laser.default_color = Color(0.8, 0.4, 0, 0.8)  # Brown/orange for diarrhea laser
	
	var start_pos = Vector2(position.x, position.y)
	var end_pos = start_pos + Vector2(cos(rotation), sin(rotation)) * 400
	
	laser.add_point(start_pos)
	laser.add_point(end_pos)
	
	laser_effects[user_id] = {
		"line": laser,
		"rotation": rotation,
		"start_pos": start_pos
	}
	
	if players_container:
		players_container.add_child(laser)
	
	# Animate laser (pulsing effect)
	var tween = create_tween()
	tween.set_loops()
	tween.tween_property(laser, "default_color:a", 0.4, 0.2)
	tween.tween_property(laser, "default_color:a", 0.8, 0.2)
	
	# Remove after duration
	await get_tree().create_timer(duration / 1000.0).timeout
	deactivate_laser(user_id)

func deactivate_laser(user_id):
	if laser_effects.has(user_id):
		laser_effects[user_id].line.queue_free()
		laser_effects.erase(user_id)
		print("[PowerupManager] Laser deactivated for user ", user_id)

func show_plunger_effect(user_id, position, rotation):
	# Create plunger swing animation
	var plunger = Sprite2D.new()
	plunger.position = Vector2(position.x, position.y)
	plunger.rotation = rotation
	
	# Create simple plunger visual
	var texture = ImageTexture.new()
	var image = Image.create(40, 40, false, Image.FORMAT_RGBA8)
	image.fill(Color(1, 0, 0, 1))  # Red plunger
	texture.set_image(image)
	plunger.texture = texture
	
	if players_container:
		players_container.add_child(plunger)
	
	# Animate swing
	var tween = create_tween()
	tween.tween_property(plunger, "rotation", rotation + PI / 2, 0.2)
	tween.tween_callback(plunger.queue_free)

func create_explosion_effect(pos: Vector2) -> CPUParticles2D:
	var explosion = CPUParticles2D.new()
	explosion.position = pos
	explosion.emitting = true
	explosion.one_shot = true
	explosion.amount = 20
	explosion.lifetime = 0.5
	explosion.explosiveness = 0.8
	explosion.color = Color(0.8, 0.6, 0.2, 1)
	explosion.scale_amount_min = 2.0
	explosion.scale_amount_max = 4.0
	
	# Auto cleanup using a timer
	var cleanup_timer = get_tree().create_timer(1.0)
	cleanup_timer.timeout.connect(func(): 
		if is_instance_valid(explosion):
			explosion.queue_free()
	)
	
	return explosion

func _on_powerup_body_entered(body: Node2D, powerup_id: String):
	# Check if the body is a player
	if body.has_method("setup") and body.is_local_player:
		print("[PowerupManager] Local player collided with powerup ", powerup_id)
		# Send pickup request to server
		var network_manager = get_node_or_null("/root/Main/GameManager/NetworkManager")
		if network_manager:
			network_manager.send_message({
				"type": "pickup_powerup",
				"userId": body.player_id,
				"powerupId": powerup_id
			})

func _process(_delta):
	# Update laser positions if player moves
	for user_id in laser_effects:
		var laser_data = laser_effects[user_id]
		# You could update laser position based on player movement here if needed

