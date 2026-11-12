"""Bounded HTTP reads; no redirects, environment proxies, or repository execution."""
import json
import httpx


class ServiceError(Exception):
    def __init__(self, message: str, status: int = 502):
        self.message, self.status = message, status
        super().__init__(message)


async def read_json(client: httpx.AsyncClient, method: str, url: str, *, limit=300000, **kwargs):
    async with client.stream(method, url, **kwargs) as response:
        if response.status_code != 200:
            raise ServiceError("Remote service unavailable or access denied", 503)
        content = bytearray()
        async for block in response.aiter_bytes():
            content.extend(block)
            if len(content) > limit:
                raise ServiceError("Remote response exceeds inspection limits")
        try:
            result = json.loads(content)
        except (ValueError, UnicodeError) as exc:
            raise ServiceError("Invalid remote JSON") from exc
        if not isinstance(result, dict):
            raise ServiceError("Invalid remote object")
        return result
