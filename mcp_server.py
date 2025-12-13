from mcp.server.fastmcp import FastMCP
import json
import os
from typing import List, Optional, Dict, Any

# Since the browser app uses a JSON format for import/export,
# this MCP server will operate on such a JSON file.
# The user (or AI) must provide the path to the exported file.

# Initialize FastMCP server
mcp = FastMCP("calendar-mcp")

@mcp.tool()
def read_calendar_file(file_path: str) -> str:
    """Reads the calendar export file and returns a summary of events."""
    try:
        if not os.path.exists(file_path):
            return f"Error: File {file_path} not found."

        with open(file_path, 'r') as f:
            data = json.load(f)

        events = data.get('data', {}).get('events', [])
        calendars = data.get('data', {}).get('calendars', [])

        summary = f"Found {len(calendars)} calendars and {len(events)} events.\n"
        summary += "Calendars: " + ", ".join([c.get('name', 'Unknown') for c in calendars]) + "\n"

        # List first 10 events as preview
        summary += "Events (first 10):\n"
        for evt in events[:10]:
            summary += f"- [{evt.get('id')}] {evt.get('name')} ({evt.get('start')})\n"

        return summary
    except Exception as e:
        return f"Error reading file: {str(e)}"

@mcp.tool()
def add_event(file_path: str, name: str, start: str, end: str, calendar: str, description: Optional[str] = "") -> str:
    """Adds a new event to the calendar export file."""
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)

        events = data.get('data', {}).get('events', [])

        # Create new event
        # ID generation: use timestamp + random
        import time
        import random
        new_id = f"evt_{int(time.time())}_{random.randint(1000, 9999)}"

        new_event = {
            "id": new_id,
            "name": name,
            "start": start,
            "end": end,
            "calendar": calendar,
            "description": description,
            "allDay": False,
            "createdAt": int(time.time() * 1000),
            "updatedAt": int(time.time() * 1000),
            "recurrence": {"type": "none"}
        }

        events.append(new_event)
        data['data']['events'] = events
        data['timestamp'] = int(time.time() * 1000)

        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)

        return f"Event '{name}' added successfully with ID {new_id}."
    except Exception as e:
        return f"Error adding event: {str(e)}"

@mcp.tool()
def update_event(file_path: str, event_id: str, updates: str) -> str:
    """
    Updates an existing event in the calendar export file.
    'updates' should be a JSON string of fields to update (e.g., '{"name": "New Name", "start": "..."}').
    """
    try:
        try:
            update_dict = json.loads(updates)
        except json.JSONDecodeError:
            return "Error: 'updates' argument must be a valid JSON string."

        with open(file_path, 'r') as f:
            data = json.load(f)

        events = data.get('data', {}).get('events', [])

        found = False
        for evt in events:
            if evt.get('id') == event_id:
                # Update fields
                for key, value in update_dict.items():
                    if key != 'id': # Prevent changing ID
                        evt[key] = value

                # Update timestamp
                import time
                evt['updatedAt'] = int(time.time() * 1000)
                found = True
                break

        if not found:
            return f"Error: Event with ID {event_id} not found."

        data['data']['events'] = events
        data['timestamp'] = int(time.time() * 1000)

        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)

        return f"Event {event_id} updated successfully."
    except Exception as e:
        return f"Error updating event: {str(e)}"

@mcp.tool()
def delete_event(file_path: str, event_id: str) -> str:
    """Deletes an event from the calendar export file."""
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)

        events = data.get('data', {}).get('events', [])

        # Filter out the event
        initial_count = len(events)
        events = [evt for evt in events if evt.get('id') != event_id]

        if len(events) == initial_count:
             return f"Error: Event with ID {event_id} not found."

        data['data']['events'] = events
        import time
        data['timestamp'] = int(time.time() * 1000)

        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)

        return f"Event {event_id} deleted successfully."
    except Exception as e:
        return f"Error deleting event: {str(e)}"

@mcp.tool()
def list_events(file_path: str) -> str:
    """Lists all events in the calendar file in JSON format."""
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)
        events = data.get('data', {}).get('events', [])
        return json.dumps(events, indent=2)
    except Exception as e:
        return f"Error: {str(e)}"

if __name__ == "__main__":
    # Standard MCP entry point
    mcp.run()
