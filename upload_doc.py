import requests
import argparse
import os

def upload_document(file_path, worker_url):
    """
    Uploads a document to the Cloudflare Worker.

    Args:
        file_path (str): The path to the document to upload.
        worker_url (str): The URL of the Cloudflare Worker.
    """
    if not os.path.exists(file_path):
        print(f"Error: File not found at {file_path}")
        return

    try:
        with open(file_path, 'rb') as f:
            files = {'file': (os.path.basename(file_path), f)}
            response = requests.post(worker_url, files=files)
            response.raise_for_status()  # Raise an exception for bad status codes

            print("File uploaded successfully!")
            print("Response:", response.json())

    except requests.exceptions.RequestException as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Upload a document to a Cloudflare Worker.")
    parser.add_argument("file_path", help="The path to the document to upload.")
    parser.add_argument(
        "--worker-url",
        default="https://ask-my-doc.hacolby.workers.dev/",
        help="The URL of the Cloudflare Worker.",
    )
    args = parser.parse_args()

    upload_document(args.file_path, args.worker_url)
