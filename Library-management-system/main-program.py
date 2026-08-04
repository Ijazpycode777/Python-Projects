from library import Library
from authentication import Authentication
from user import Users
def main():
    auth=Authentication()
    library=Library()
    current_user=None
    while True:
        print("\n=====Library Management system=====")
        print("\n1.Register")
        print("2.Login")
        print("3.Exit\n")
        choice=input("Enter your choice: ")
        if choice=="1":
            name=input("Enter your name: ")
            password=input("Enter your password: ")
            if len(password)<8:
                print("Password must be at least 8 characters.")
                continue
            if not any(char.isdigit() for char in password):
                print("Password must contain digits.")
                continue
            current_user=auth.register(name,password)
        elif choice=="2":
            name=input("Enter your name: ")
            password=input("Enter your password: ")
            current_user=auth.login(name,password)
        elif choice=="3":
            print("Logging out...")
            break
        else:
            print("Invalid choice.")
        if current_user:
            while True:
                print("\n1.Search Book")
                print("2.Show Borrowed Books")
                print("3.Return book")   
                print("4.Logout")                 
                choice=input("Enter your choice: ")
                if choice=="1":
                    query=input("Enter the book title or author to search: ")
                    library.search_book(query)
                    library.show_books()
                    try:                            
                        book_number=int(input("Enter the book number you want to borrow: "))
                        selected_book=library.books[book_number-1]
                        if selected_book in current_user.borrowed_books:
                            print("You have already borrowed this book.")
                        else:
                            current_user.borrow_book(selected_book)
                    except (ValueError,IndexError):
                        print("\nOperation cancelled.")
                elif choice=="2":
                    current_user.show_borrowed_books()
                elif choice=="3":
                    try:
                        current_user.show_borrowed_books()
                        book_to_return=int(input("Enter the index of the book you want to return: "))
                        selected_book=current_user.borrowed_books[book_to_return-1]
                        current_user.return_book(selected_book)
                    except (ValueError,IndexError):
                        print("Invalid choice.")
                elif choice=="4":
                    print("Logging out...")
                    break
                else:   
                        print("Invalid choice.")    
                        
if __name__=="__main__":
    main()
