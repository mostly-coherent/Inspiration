#!/usr/bin/env python3
"""
HTTP API wrapper for Inspiration engine scripts.

This Flask app wraps the existing CLI scripts (generate.py, seek.py, sync_messages.py)
to enable HTTP access from the Next.js frontend deployed on Vercel.
"""

import os
import sys
import json
import subprocess
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Allow requests from Vercel frontend

ENGINE_DIR = Path(__file__).parent


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'ok',
        'engine': 'inspiration',
        'version': '1.0.0'
    })


@app.route('/generate', methods=['POST'])
def generate():
    """
    Wrapper for generate.py
    
    Expected request body:
    {
        "mode": "insights" | "ideas",
        "preset": "daily" | "sprint" | "month" | "quarter" | "custom",
        "days": int (optional, for custom mode),
        "fromDate": "YYYY-MM-DD" (optional),
        "toDate": "YYYY-MM-DD" (optional),
        "date": "YYYY-MM-DD" (optional, single date),
        "bestOf": int (optional),
        "temperature": float (optional),
        "dryRun": bool (optional)
    }
    """
    try:
        data = request.json or {}
        
        # Build command args
        args = ['python3', str(ENGINE_DIR / 'generate.py')]
        
        # Mode is required
        mode = data.get('mode')
        if not mode:
            return jsonify({
                'success': False,
                'error': 'mode is required (insights or ideas)'
            }), 400
        args.extend(['--mode', mode])
        
        # Preset mode or custom
        preset = data.get('preset', 'custom')
        if preset == 'daily':
            args.append('--daily')
        elif preset == 'sprint':
            args.append('--sprint')
        elif preset == 'month':
            args.append('--month')
        elif preset == 'quarter':
            args.append('--quarter')
        else:
            # Custom mode - use explicit parameters
            if 'days' in data:
                args.extend(['--days', str(data['days'])])
            elif 'date' in data:
                args.extend(['--date', data['date']])
            elif 'fromDate' in data and 'toDate' in data:
                # Calculate days from today to start date
                from datetime import datetime
                from_date = datetime.strptime(data['fromDate'], '%Y-%m-%d')
                today = datetime.now()
                days_back = (today - from_date).days + 1
                args.extend(['--days', str(days_back)])
        
        # Optional parameters
        if 'bestOf' in data:
            args.extend(['--best-of', str(data['bestOf'])])
        if 'temperature' in data:
            args.extend(['--temperature', str(data['temperature'])])
        if data.get('dryRun'):
            args.append('--dry-run')
        
        # Run script
        result = subprocess.run(
            args,
            cwd=str(ENGINE_DIR),
            capture_output=True,
            text=True,
            env={**os.environ, 'PYTHONUNBUFFERED': '1'},
            timeout=600  # 10 minute timeout
        )
        
        # Parse output to find generated file
        output_file_match = None
        if result.stdout:
            import re
            output_file_match = re.search(
                r'output/(?:[\w]+_)?[\d-]+(?:_to_[\d-]+)?\.judge(?:-no-(?:idea|post))?\.md',
                result.stdout
            )
        
        output_file = output_file_match.group(0) if output_file_match else None
        
        # Read output file if it exists
        content = None
        if output_file:
            output_path = ENGINE_DIR.parent / 'data' / output_file.replace('output/', '')
            if output_path.exists():
                try:
                    content = output_path.read_text(encoding='utf-8')
                except Exception as e:
                    print(f"Warning: Could not read output file: {e}")
        
        # Parse stats from stdout
        stats = parse_generate_stats(result.stdout)
        
        if result.returncode != 0:
            # Extract error message
            error_msg = result.stderr or result.stdout or 'Unknown error'
            # Try to extract meaningful error
            error_lines = [line for line in error_msg.split('\n') 
                          if 'Error' in line or 'Failed' in line or 'Traceback' in line]
            if error_lines:
                error_msg = '\n'.join(error_lines[-5:])  # Last 5 error lines
            
            return jsonify({
                'success': False,
                'error': f'Script failed (exit {result.returncode}): {error_msg[:500]}',
                'stdout': result.stdout[-1000:] if result.stdout else '',
                'stderr': result.stderr[-1000:] if result.stderr else '',
                'stats': stats
            }), 500
        
        return jsonify({
            'success': True,
            'outputFile': output_file,
            'content': content,
            'judgeContent': content,  # Same as content for backward compatibility
            'stdout': result.stdout,
            'stderr': result.stderr,
            'stats': stats
        })
        
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False,
            'error': 'Generation timed out after 10 minutes'
        }), 504
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'API error: {str(e)}'
        }), 500


@app.route('/seek', methods=['POST'])
def seek():
    """
    Wrapper for seek.py
    
    Expected request body:
    {
        "query": str (required),
        "daysBack": int (default: 90),
        "topK": int (default: 10),
        "minSimilarity": float (default: 0.0),
        "workspaces": list[str] (optional),
        "temperature": float (optional),
        "bestOf": int (optional),
        "dryRun": bool (optional)
    }
    """
    try:
        data = request.json or {}
        
        query = data.get('query')
        if not query:
            return jsonify({
                'success': False,
                'error': 'query is required'
            }), 400
        
        # Build command args
        args = ['python3', str(ENGINE_DIR / 'seek.py')]
        args.extend(['--query', query])
        args.extend(['--days', str(data.get('daysBack', 90))])
        args.extend(['--top-k', str(data.get('topK', 10))])
        args.extend(['--min-similarity', str(data.get('minSimilarity', 0.0))])
        args.append('--json')  # Always JSON for API
        
        if 'workspaces' in data and data['workspaces']:
            for workspace in data['workspaces']:
                args.extend(['--workspace', workspace])
        
        if 'temperature' in data:
            args.extend(['--temperature', str(data['temperature'])])
        if 'bestOf' in data:
            args.extend(['--best-of', str(data['bestOf'])])
        if data.get('dryRun'):
            args.append('--dry-run')
        
        # Run script
        result = subprocess.run(
            args,
            cwd=str(ENGINE_DIR),
            capture_output=True,
            text=True,
            env={**os.environ, 'PYTHONUNBUFFERED': '1'},
            timeout=300  # 5 minute timeout
        )
        
        if result.returncode != 0:
            error_msg = result.stderr or result.stdout or 'Unknown error'
            return jsonify({
                'success': False,
                'query': query,
                'error': f'Script failed: {error_msg[:500]}',
                'stats': {
                    'conversationsAnalyzed': 0,
                    'daysSearched': data.get('daysBack', 90),
                    'useCasesFound': 0
                }
            }), 500
        
        # Parse JSON output
        try:
            json_match = None
            if result.stdout:
                import re
                json_match = re.search(r'\{[\s\S]*\}', result.stdout)
            
            if not json_match:
                raise ValueError('No JSON found in output')
            
            output = json.loads(json_match.group(0))
            return jsonify(output)
            
        except (json.JSONDecodeError, ValueError) as e:
            return jsonify({
                'success': False,
                'query': query,
                'error': f'Failed to parse JSON output: {str(e)}',
                'stdout': result.stdout[-1000:] if result.stdout else '',
                'stats': {
                    'conversationsAnalyzed': 0,
                    'daysSearched': data.get('daysBack', 90),
                    'useCasesFound': 0
                }
            }), 500
            
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False,
            'query': data.get('query', ''),
            'error': 'Seek timed out after 5 minutes',
            'stats': {
                'conversationsAnalyzed': 0,
                'daysSearched': data.get('daysBack', 90),
                'useCasesFound': 0
            }
        }), 504
    except Exception as e:
        return jsonify({
            'success': False,
            'query': data.get('query', ''),
            'error': f'API error: {str(e)}',
            'stats': {
                'conversationsAnalyzed': 0,
                'daysSearched': data.get('daysBack', 90),
                'useCasesFound': 0
            }
        }), 500


@app.route('/sync', methods=['POST'])
def sync():
    """
    Wrapper for sync_messages.py
    
    Note: This requires access to local Cursor database, so it will fail on cloud deployments.
    """
    try:
        args = ['python3', str(ENGINE_DIR / 'scripts' / 'sync_messages.py')]
        
        result = subprocess.run(
            args,
            cwd=str(ENGINE_DIR),
            capture_output=True,
            text=True,
            env={**os.environ, 'PYTHONUNBUFFERED': '1'},
            timeout=300  # 5 minute timeout
        )
        
        if result.returncode != 0:
            # Check for database not found error
            error_msg = result.stderr or result.stdout or 'Unknown error'
            if 'Database not found' in error_msg or 'not found at' in error_msg:
                return jsonify({
                    'success': False,
                    'error': 'Cannot sync from cloud environment. The app cannot access your local Cursor database when running on Vercel. Please run the app locally to sync.'
                }), 400
            
            return jsonify({
                'success': False,
                'error': error_msg[:500]
            }), 500
        
        # Parse stats from stdout
        indexed_match = None
        failed_match = None
        skipped_match = None
        if result.stdout:
            import re
            indexed_match = re.search(r'Indexed: (\d+)', result.stdout)
            failed_match = re.search(r'Failed: (\d+)', result.stdout)
            skipped_match = re.search(r'Already indexed.*?(\d+)', result.stdout)
        
        indexed = int(indexed_match.group(1)) if indexed_match else 0
        failed = int(failed_match.group(1)) if failed_match else 0
        skipped = int(skipped_match.group(1)) if skipped_match else 0
        
        if 'No new messages to sync' in result.stdout:
            return jsonify({
                'success': True,
                'message': 'Brain is up to date',
                'stats': {'indexed': 0, 'skipped': skipped, 'failed': failed}
            })
        else:
            return jsonify({
                'success': True,
                'message': 'Sync completed successfully',
                'stats': {'indexed': indexed, 'skipped': skipped, 'failed': failed}
            })
            
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False,
            'error': 'Sync timed out after 5 minutes'
        }), 504
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'API error: {str(e)}'
        }), 500


def parse_generate_stats(stdout: str) -> dict:
    """Parse stats from generate.py output."""
    import re
    
    days_processed_match = re.search(r'Days processed:\s*(\d+)', stdout, re.IGNORECASE)
    days_with_activity_match = re.search(r'Days with activity:\s*(\d+)', stdout, re.IGNORECASE)
    days_with_output_match = re.search(r'Days with (?:ideas|posts):\s*(\d+)', stdout, re.IGNORECASE)
    items_generated_match = re.search(r'Items (?:generated|returned):\s*(\d+)', stdout, re.IGNORECASE)
    conversations_match = re.search(r'Conversations analyzed:\s*(\d+)', stdout, re.IGNORECASE) or re.search(r'(\d+)\s+conversations', stdout, re.IGNORECASE)
    harmonization_match = re.search(r'Harmonization Stats:\s*(\d+)\s+processed,\s*(\d+)\s+added,\s*(\d+)\s+updated,\s*(\d+)\s+deduplicated', stdout, re.IGNORECASE)
    
    days_processed = int(days_processed_match.group(1)) if days_processed_match else (int(days_with_activity_match.group(1)) if days_with_activity_match else 0)
    
    stats = {
        'daysProcessed': days_processed,
        'daysWithActivity': int(days_with_activity_match.group(1)) if days_with_activity_match else days_processed,
        'daysWithOutput': int(days_with_output_match.group(1)) if days_with_output_match else 0,
        'itemsGenerated': int(items_generated_match.group(1)) if items_generated_match else 0,
        'conversationsAnalyzed': int(conversations_match.group(1)) if conversations_match else 0,
    }
    
    if harmonization_match:
        stats['harmonization'] = {
            'itemsProcessed': int(harmonization_match.group(1)),
            'itemsAdded': int(harmonization_match.group(2)),
            'itemsUpdated': int(harmonization_match.group(3)),
            'itemsDeduplicated': int(harmonization_match.group(4)),
        }
    
    return stats


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)

