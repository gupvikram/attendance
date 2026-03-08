import asyncio
from typing import Dict
from routers.employees import get_descriptors
from main import supabase

async def main():
    try:
        class FakeRequest:
            headers: Dict[str, str] = {}
        class FakeResponse:
            headers: Dict[str, str] = {}
        req = FakeRequest()
        res = FakeResponse()
        device = {"id": "12345"}
        print("Testing get_descriptors...")
        await get_descriptors(request=req, response=res, device=device)
        print("Descriptors OK")
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
