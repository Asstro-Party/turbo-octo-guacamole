extends Area2D

var portal_pair_id = 0
var linked_portal: Area2D = null
var is_active = true
var cooldown_time = 1.0
var players_on_cooldown = []

func _ready():
	body_entered.connect(_on_player_entered)

func _on_player_entered(body):
	if not is_active or linked_portal == null:
		return
	
	if body.has_method("teleport") and body.player_id not in players_on_cooldown:
		# Teleport the player
		body.position = linked_portal.position
		
		# Add to cooldown to prevent instant re-teleport
		players_on_cooldown.append(body.player_id)
		
		# Visual/sound effect
		play_teleport_effect()
		
		# Clear cooldown after delay
		await get_tree().create_timer(cooldown_time).timeout
		players_on_cooldown.erase(body.player_id)

func play_teleport_effect():
	# Flash animation
	modulate = Color(0.5, 1, 1, 1)
	await get_tree().create_timer(0.2).timeout
	modulate = Color(1, 1, 1, 1)

func link_to(other_portal: Area2D):
	linked_portal = other_portal
	other_portal.linked_portal = self