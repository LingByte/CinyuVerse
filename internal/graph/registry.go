package graph

import "sync"

var (
	mu          sync.RWMutex
	globalStore Store
)

func SetGlobalStore(store Store) {
	mu.Lock()
	defer mu.Unlock()
	globalStore = store
}

func GetGlobalStore() Store {
	mu.RLock()
	defer mu.RUnlock()
	return globalStore
}
