try:
        with open('list1.txt','r') as file: #Read FILE
                list1=file.read().splitlines()
except:
        list1=[ ]
def save_task():
        with open('list1.txt','w') as file:
                for task in list1:
                        file.write(task + "\n") #Save in FILE
print("1. Add tasks")
print("2.Delete tasks")
print("3.View tasks")
print("4.Mark task as done")      # Main body of Loop
print("5.Unmark a task")
print("6.Completed and remaining tasks.")
print("7.Exit")
while True:
        choice=input("Enter your choice: ")
        #FIRST FUNCTION
        if choice=="1":
            while True:
                task=input("Enter task or type 0 to return: ")
                if task=="0":
                    print("Returning to menu.")   #Return back
                    break
                else:
                    list1.append("[ ] "+task)
                    print("Added succesfully!")
                    save_task()
                    break
        #SECOND FUNCTION 
        elif choice=="2":
            if  not list1:
                print("Nothing to delete!")
            else:
                for i in range(len(list1)):
                        print(i+1,"-",list1[i])
                while True:
                    try:
                        n=int(input("Enter task number to delete or enter 0 to return: "))
                    except ValueError:
                            print("Enter a valid number.")
                            continue
                    if n==0:
                        print("No tasks deleted.")
                        break
                    elif 1<=n<= len(list1):  #TASK DELETION HERE
                        list1.pop(n-1)
                        print("Task deleted!")
                        save_task()
                        break
                    else:
                        print("Invalid input")
        #THIRD FUNCTION HERE        
        elif choice=="3":
            if  not list1:
                print("No tasks added yet.")
            else:
                for i in range(len(list1)):
                    print(i+1,"-",list1[i])    #LIST BEING DISPLAYED
         #4TH FUNCTION HERE           
        elif choice=="4":
            if not list1:
                print("No task added yet.")
            else:
                for i in range(len(list1)):
                    print(i+1,"-",list1[i]) # LIST DISPLAY AGAIN
                while True:
                    try:
                        num=int(input("Enter task to be marked or type 0 to return: "))
                    except ValueError:
                        print("Enter a valid number.")
                        continue
                    if num==0:
                        print("No tasks added")
                        break
                    elif 1<=num<=len(list1):
                        if list1[num-1].startswith("[x]"):
                            print("Task is already marked!")
                        else:
                           list1[num-1]=list1[num-1].replace("[ ] ","[x] ") #REPLACEMENT
                           save_task()
                           print("Task marked.")
                           break
                    else:
                        print("Invalid number!")
        #FIFTH FUNCTION HERE
        elif choice =="5":
                 if not list1:
                     print("No task added yet.\nReturning to menu.")
                 else:
                     for i in range(len(list1)):
                        print(i+1,"-",list1[i])
                     while True:
                        try:
                            num=int(input("Enter task to be marked or type 0 to return: "))
                        except ValueError:
                            print("Enter a valid number.")
                            continue
                        if num==0:
                            print("No tasks added.\nReturning to menu.")#RETURNING
                            break
                        elif 1<=num<=len(list1): #NUMBER VALIDITY
                            if list1[num-1].startswith("[ ]"):
                                print("Task is already unmarked!")
                                break
                            else:
                                list1[num-1]=list1[num-1].replace("[x] ","[ ] ")
                                save_task()
                                print("Task unmarked.")
                                break
         #LAST FUNCTION HERE                               
        elif choice == "6":
                if not list1:
                    print("No tasks added yet!")
                else:
                    completed=0
                    for task in list1:
                        if task.startswith("[x]"):
                            completed+=1
                    remaining = len(list1) - completed
                    print("completed= ",completed)
                    print("Remaining= ",remaining)
         #PROGRAM ENDS       
        elif choice=="7" or choice.strip().lower()=="no":
                print("Goodbye!")
                break
        else:
            print("Invalid input only between 1 and 7 or no to exit.")
    
