expenses={}
try:
    with open ("expensesV2.txt","r") as file:
        for line in file:
            name,amount = line.strip().split(":")
            expenses[name]=float(amount)
except FileNotFoundError:
    pass

def save_file():
    with open("expensesV2.txt","w") as file:
        for name,amount in expenses.items():
            file.write(f"{name}:{amount}\n")

while True:
    print("\n=======Expenses calculator V2=======\n")
    print("1.Add expenses or update one")
    print("2.View expenses")
    print("3.Delete expenses")
    print("4.Show total amount")
    print("5.Search an expense")
    print("6.Exit\n")
    
    choice=input("Enter your choice: ")
    
    if choice=="1":
        name=input("Enter expense name: ")
        try:
            amount=float(input("Enter expense amount: "))
        except ValueError:
            print("Invalid amount!")
            continue
        expenses[name]=amount
        save_file()
        
    elif choice=="2":
        if not expenses:
            print("Nothing added yet!")
        else:
            for name,amount in expenses.items():
                print(name,":",amount)

    elif choice=="3":
        while True:
            if not expenses:
                break
            else:
                name=input("Enter expense name to delete or type no to return: ").strip()
                if name in expenses:
                    del expenses[name]
                    print("Expense deleted!")
                    save_file()
                    break
                elif name=="no".lower():
                    print("Returning!")
                    break
                else:
                    print("Expense not found!")
                    
    elif choice=="4":
        total=sum(expenses.values())
        print("Total amount= ",total)

    elif choice=="5":
        name=input("Enter name to search: ").strip()
        if name in expenses.keys():
            print(name,":",expenses[name])
        else:
            print("Expense not found!")

    elif choice=="6" or choice=="no".strip().lower():
        print("Goodbye!")
        break
    else:
        print("Invalid choice! Enter between 1-6 or no to exit.")
