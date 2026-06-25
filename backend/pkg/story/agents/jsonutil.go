package agents

import (
	"encoding/json"
)

func protocolJSONUnmarshal(raw string, dest any) error {
	return json.Unmarshal([]byte(raw), dest)
}
