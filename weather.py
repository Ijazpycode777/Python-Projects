import requests
while True:
    city=input("Enter city name here or type no to exit: ").strip().lower()
    if city=="no":
        break
    else:
        try:
            response=requests.get(f"https://wttr.in/{city}?format=j1")
            weather=response.json()
            current=weather["current_condition"][0]
            area=weather["nearest_area"][0]
            print("Temperatue= ",current["temp_C"],"C")
            print("Humidity= ",current["humidity"],"%")
            print("Wind speed= ",current["windspeedKmph"],"km/h")
            print("Feels like= ",current["FeelsLikeC"],"C")
            print("Weather Description= ",current["weatherDesc"][0]["value"])
            print("Observation Time",current["observation_time"])
            print("Nearest Area = ",area["areaName"][0]["value"])
            print("Province = ",area["region"][0]["value"])
            print("Country = ",area["country"][0]["value"])
            print()
        except Exception:
            print("Couldn't get weather info!")
