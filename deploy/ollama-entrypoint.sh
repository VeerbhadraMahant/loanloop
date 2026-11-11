#!/bin/sh
# Start the server, pull the model if the volume does not have it yet, then stay in the foreground.
ollama serve &
pid=$!
until ollama list >/dev/null 2>&1; do sleep 1; done
ollama list | grep -q "^${OLLAMA_MODEL}" || ollama pull "${OLLAMA_MODEL}"
wait $pid
