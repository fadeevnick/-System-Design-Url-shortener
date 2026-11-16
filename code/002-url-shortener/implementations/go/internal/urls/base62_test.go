package urls

import "testing"

func TestEncodeBase62(t *testing.T) {
	tests := map[int64]string{0: "0", 1: "1", 61: "Z", 62: "10", 3843: "ZZ"}
	for value, expected := range tests {
		if actual := EncodeBase62(value); actual != expected {
			t.Fatalf("EncodeBase62(%d) = %q, want %q", value, actual, expected)
		}
	}
}
