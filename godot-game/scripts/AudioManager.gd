extends Node

# Preload all your sounds here for fast access
var sounds = {
	"gunshot": preload("res://assets/sounds/fart_sound.mp3"),
	#"reload": preload("res://assets/sounds/reload.wav"),
	#"hit": preload("res://assets/sounds/hit.wav"),
	#"explosion": preload("res://assets/sounds/explosion.wav")
}

func play_sound(name: String, position: Vector2 = Vector2.ZERO):
	if not sounds.has(name):
		print("Unknown sound:", name)
		return

	var sound = AudioStreamPlayer2D.new()
	sound.stream = sounds[name]
	sound.position = position
	sound.autoplay = false
	sound.volume_db = 0
	add_child(sound)
	sound.play()

	# Automatically free the node when done
	sound.finished.connect(sound.queue_free)
