
import requests

BASE_URL = "http://localhost:8500/api/users"

def test_get_incidents():
    try:
        response = requests.get(f"{BASE_URL}/incidents")
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            print(f"Incidents: {response.json()}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Connection Error: {e}")

if __name__ == "__main__":
    test_get_incidents()
