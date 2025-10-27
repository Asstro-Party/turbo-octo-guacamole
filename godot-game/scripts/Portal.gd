extends Area2D

var portal_pair_id = 0
var linked_portal: Area2D = null
var cooldown_time = 0.5
var players_on_cooldown = []
var has_been_used = false

func _ready():
	body_entered.connect(_on_player_entered)
	monitoring = true
	print("Portal ready at position:", position)

func _on_player_entered(body):
	print("[Portal] _on_player_entered called for body:", body.name if body else "null")
	
	if has_been_used:
		print("[Portal] Already used, ignoring")
		return
		
	if linked_portal == null:
		print("[Portal] No linked portal, ignoring")
		return
	
	if not body.has_method("teleport"):
		print("[Portal] Body doesn't have teleport method, ignoring")
		return
	
	# Allow ANY player to trigger teleport (removed local player check)
	
	if body.player_id in players_on_cooldown:
		print("[Portal] Player on cooldown, ignoring")
		return
	
	print("[Portal] Starting teleport for player", body.player_id)
	
	# Mark both portals as used
	has_been_used = true
	if linked_portal:
		linked_portal.has_been_used = true
	
	# Disable collision detection
	set_deferred("monitoring", false)
	if linked_portal:
		linked_portal.set_deferred("monitoring", false)
	
	# Calculate teleport position
	var teleport_pos = linked_portal.position
	var offset = Vector2(80, 0).rotated(randf() * TAU)
	teleport_pos += offset
	
	print("[Portal] Teleporting to:", teleport_pos)
	
	# Teleport the player
	body.position = teleport_pos
	
	# NOTIFY SERVER about the teleport - Use relative path
	var network_manager = get_parent().get_parent().get_node_or_null("NetworkManager")
	
	if network_manager:
		print("[Portal] Sending teleport notification to server for player:", body.player_id)
		
		# Only local player sends the update to avoid duplicate messages
		if body.is_local_player:
			network_manager.send_message({
				"type": "player_teleported",
				"userId": body.player_id,
				"position": {
					"x": teleport_pos.x,
					"y": teleport_pos.y
				}
			})
		else:
			print("[Portal] Non-local player - server will update via game state")
	else:
		print("[Portal] WARNING: NetworkManager not found at path!")
	
	# Visual effects
	play_teleport_effect()
	if linked_portal:
		linked_portal.play_teleport_effect()
	
	# Destroy portals after delay
	await get_tree().create_timer(0.5).timeout
	
	if is_instance_valid(self):
		queue_free()
	
	if linked_portal and is_instance_valid(linked_portal):
		linked_portal.queue_free()

func play_teleport_effect():
	var tween = create_tween()
	tween.tween_property(self, "modulate:a", 0.0, 0.5)

func link_to(other_portal: Area2D):
	linked_portal = other_portal
	other_portal.linked_portal = self
	print("[Portal] Linked to other portal at:", other_portal.position)
