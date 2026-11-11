"""Run a uvicorn app on one dual-stack socket (IPv4 + IPv6) on $PORT.

uvicorn's `--host ::` is IPv6-only (asyncio sets IPV6_V6ONLY), but Railway's public edge forwards over IPv4 while its
private network is IPv6, so a service must accept both. Usage: python serve.py <module:app> <default port>
"""
import os
import socket
import sys

import uvicorn


def dual_stack_socket(port: int) -> socket.socket:
    s = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
    s.bind(("::", port))
    return s


if __name__ == "__main__":
    app, default_port = sys.argv[1], int(sys.argv[2])
    sys.path.insert(0, os.getcwd())  # import the app from the working directory, like the uvicorn CLI
    sock = dual_stack_socket(int(os.environ.get("PORT", default_port)))
    uvicorn.run(app, fd=sock.fileno())
