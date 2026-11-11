# Fallback LLM on CPU. Mount a Railway volume at /root/.ollama so the model is pulled once.
FROM ollama/ollama
ENV OLLAMA_HOST=[::]:11434 OLLAMA_MODEL=qwen3:8b OLLAMA_KEEP_ALIVE=-1
COPY deploy/ollama-entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh
EXPOSE 11434
ENTRYPOINT ["/entrypoint.sh"]
