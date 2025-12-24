import requests

def check_api_endpoints():
    """
    Check if the API endpoints are available and functioning correctly.
    """
    BASE_URL = "http://localhost:5050"
    
    # Check if server is running
    try:
        response = requests.get(BASE_URL, timeout=5)
        print(f"✅ Server is running: {response.status_code} {response.reason}")
    except requests.exceptions.ConnectionError:
        print("❌ Server connection failed - Is the backend running?")
        return
    
    # Define endpoints to check
    endpoints = [
        "/api/statistics",
        "/api/transactions?limit=5",
        "/api/statistics/locations", 
        "/api/test-transaction"
    ]
    
    # Check each endpoint
    for endpoint in endpoints:
        try:
            response = requests.get(f"{BASE_URL}{endpoint}", timeout=5)
            if response.status_code == 200:
                print(f"✅ {endpoint} - Available")
            else:
                print(f"❌ {endpoint} - Not available (Status: {response.status_code} {response.reason})")
        except requests.exceptions.RequestException as e:
            print(f"❌ {endpoint} - Error: {str(e)}")
    
    print("\nAPI Endpoint Check Complete")

if __name__ == "__main__":
    check_api_endpoints()