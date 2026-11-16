package urls

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

func EncodeBase62(value int64) string {
	if value < 0 {
		panic("base62 value must be non-negative")
	}
	if value == 0 {
		return string(alphabet[0])
	}
	result := make([]byte, 0, 11)
	for value > 0 {
		result = append([]byte{alphabet[value%62]}, result...)
		value /= 62
	}
	return string(result)
}
