import hashlib
users={}
try:
    with open("users.txt","r") as file:
        for line in file:
            username, hashed_password = line.strip().split(":")
            users[username] = hashed_password
except FileNotFoundError:
    pass
def save_users():
    with open("users.txt","w") as file:
        for username, hashed_password in users.items():
            file.write(f"{username}:{hashed_password}\n")
def register():
    username = input("Enter a username: ")
    if username in users:
        print("Username already exists!")
        return
    password = input("Enter a password: ")
    if len(password) < 7:
        print("Password must be at least 7 characters long!")
        return
    if not any(char.isdigit() for char in password):
        print("Password must contain at least one number!")
        return
    hashed_password = hashlib.sha256(password.encode()).hexdigest()
    users[username] = hashed_password
    save_users()
    print("User registered successfully!")
    return username
def login():
    username = input("Enter your username: ")
    if username not in users:
        print("User not found!")
        return None  
    password = input("Enter your password: ")
    hashed_password = hashlib.sha256(password.encode()).hexdigest()
    if username in users and users[username] == hashed_password:
        print("Login successful!")
        return username
    
    else:
        print("Invalid username or password!")
        return None
def deposit(username):
    if username not in users:
        print("User not found!")
        return
    try:
        amount = float(input("Enter amount to deposit: "))
        if amount <= 0:
            print("Amount must be positive!")
            return 
    except ValueError:
        print("Invalid amount!")
        return
    with open(f"{username}_balance.txt", "a") as file:
        try:
            file.write(f"Deposit:{amount}\n")
            print(f"Deposited {amount} successfully!")
        except FileNotFoundError:
            pass
def withdraw(username):
    if username not in users:
        print("User not found!")
        return
    try:
        amount = float(input("Enter amount to withdraw: "))
        if amount <= 0:
            print("Amount must be positive!")
            return
    except ValueError:
        print("Invalid amount!")
        return
    balance = 0
    try:
        with open(f"{username}_balance.txt", "r") as file:
            for line in file:
                action, amt = line.strip().split(":")
                amt = float(amt)
                if action == "Deposit":
                    balance += amt
                elif action == "Withdrawal":
                    balance -= amt
    except FileNotFoundError:
        pass
    if balance < amount:
        print("Insufficient funds!")
        return
    with open(f"{username}_balance.txt", "a") as file:
        file.write(f"Withdrawal:{amount}\n")
    print(f"Withdrew {amount} successfully!")
def check_balance(username):
    balance = 0
    try:
        with open(f"{username}_balance.txt", "r") as file:
            for line in file:
                action, amt = line.strip().split(":")
                amt = float(amt)
                if action == "Deposit":
                    balance += amt
                elif action == "Withdrawal":
                    balance -= amt
            print(f"Current balance for {username}: {balance}")
    except FileNotFoundError:
        print(f"No transaction history found for {username}")
    return balance
def main():
    while True:
        print("\n=======Bank Management System=======\n")
        print("1. Register")
        print("2. Login")
        print("3. Exit\n")
        choice1=input("Enter your choice: ")
        if choice1=="1":
            current_user=register()
            if not current_user:
                continue
        elif choice1=="2":
            current_user= login()
            if not current_user:
                continue
        elif choice1=="3" or choice1.lower()=="exit":
            print("Exiting...")
            break
        else:
            print("Invalid choice!")
            continue
        while current_user:
            print("1. Deposit Money")
            print("2. Withdraw Money")
            print("3. Check Balance")
            print("4. Exit\n")
            choice = input("Enter your choice: ")
            if choice == "1":
                deposit(current_user)
            elif choice == "2":
                withdraw(current_user)
            elif choice == "3":
                check_balance(current_user)
            elif choice == "4" or choice.lower() == "exit":
                print("Exiting...")
                current_user = None
                break
            else:
                print("Invalid choice!")
if __name__ == "__main__":
    main()

