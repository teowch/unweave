from flask import Blueprint, Response, stream_with_context

from services.container import sse_manager

sse_bp = Blueprint("sse", __name__)

@sse_bp.route("/sse/<job_id>", methods=['GET'])
def sse_stream(job_id: str):
    gen = sse_manager.subscribe(job_id)
    return Response(
        stream_with_context(gen),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # helpful if behind nginx
        },
    )
